"""Shop-side capture: day-sales tallies in → rung-up sales.

A sales sheet becomes a real Completed sale (products matched or
auto-created, stock decremented); supplier paperwork becomes an Unpaid
shop expense; anything else is refused or ignored with a sentence that
says why.

No drafts: a sheet we can't read is a resend-ask, not a stored question.
Classify functions are injectable so the pipeline is unit-testable
without network.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.classify import ClassifyFailed, classify_image, classify_text
from app.deps import check_limit
from app.routers.shop import _require_shop
from app.shop import expenses, orders, validate as v
from app.shop.errors import ShopError
from app.shop.sweep import match_or_create_products

RESEND_COPY = (
    "I couldn't make out any items on that sheet — "
    "try a clearer or better-lit photo."
)
NO_AMOUNT_COPY = (
    "I couldn't make out an amount on that paperwork — "
    "resend it with the total and I'll file it."
)
SHOP_ONLY_REFUSAL = (
    "That looks like personal spending, not a shop sale or purchase — "
    "this line only rings up shop money."
)
NOTHING_COPY = (
    "Not a tally, so I filed nothing — send your day sales "
    "and I'll ring them up."
)

# A single photo/text capture auto-files straight into the ledger with no
# human review — fine for a normal day's tally, but it means a
# convincing-enough fake sheet (or a misread by the model) becomes real
# money without anyone looking at it first. Amounts above this get held
# back for a human to confirm in the app instead of being auto-filed.
# See finding #5 of the security review — not a code bug, just capping
# the blast radius of trusting a single AI read of a photo.
LARGE_AMOUNT_ZMW = 5000.0
NEEDS_CONFIRMATION_COPY = (
    "That comes to K{amount:,.0f} — bigger than usual, so I've held it "
    "back instead of filing it automatically. Add it in the app if it's right."
)


def _ring_sale(db: Session, user: dict, business, draft: dict) -> dict:
    lines, created = match_or_create_products(db, business, draft.get("line_items"))
    if not lines:
        return {"status": "resend", "message": RESEND_COPY}
    occurred = draft.get("occurred_on") or datetime.utcnow().date().isoformat()
    try:
        sale = orders.create_order(db, user, business, "sale", {
            "items": lines, "status": "Completed",
            "customer": draft.get("party") or "Walk-in",
            "date": occurred, "channel": "Retail", "payment": "Paid",
            "notes": "From a WhatsApp tally",
        })
    except ShopError as e:
        db.rollback()
        return {"status": "error", "message": e.message}

    total = float(sale.amount_total or 0)
    if total > LARGE_AMOUNT_ZMW:
        db.rollback()
        return {"status": "needs_confirmation",
                "message": NEEDS_CONFIRMATION_COPY.format(amount=total)}

    db.commit()
    db.refresh(sale)
    return {"status": "filed", "sale": {
        "reference": sale.reference,
        "total": float(sale.amount_total or 0),
        "items": len(lines),
        "created": created,
        # Carried out so the reply can name anything this sale pushed down
        # to its reorder point — see shop_ask.low_stock_nudge.
        "product_ids": [line["product_id"] for line in lines],
        "business_id": business.id,
    }}


def _file_supplier(db: Session, user: dict, business, draft: dict) -> dict:
    # A delivery note or invoice is money you'll owe: an Unpaid expense,
    # filed where dues live. Paid flips happen in the app, by a human.
    amount = draft.get("amount")
    if not amount or float(amount) <= 0:
        return {"status": "resend", "message": NO_AMOUNT_COPY}
    if float(amount) > LARGE_AMOUNT_ZMW:
        return {"status": "needs_confirmation",
                "message": NEEDS_CONFIRMATION_COPY.format(amount=float(amount))}
    occurred = draft.get("occurred_on") or datetime.utcnow().date().isoformat()
    name = (draft.get("party") or "").strip() or "Supplier note"
    try:
        row = expenses.create_expense(db, user, business, {
            "name": name[:500], "amount": float(amount), "category": "Other",
            "date": occurred, "method": "Other", "paid": "Unpaid",
            "notes": "Supplier paperwork over WhatsApp",
        })
        db.commit()
    except ShopError as e:
        db.rollback()
        return {"status": "error", "message": e.message}
    db.refresh(row)
    return {"status": "filed_expense", "expense": {
        "name": row.party or name, "amount": float(row.amount or 0),
    }}


def _receive(db: Session, profile, classify_fn, classify_arg) -> dict:
    uid, plan = profile.id, profile.plan or "free"
    check_limit(db, uid, plan)
    business = _require_shop(db, {"id": uid})

    try:
        draft = classify_fn(classify_arg, v.INVENTORY_CATEGORIES)
    except ClassifyFailed:
        return {"status": "nothing", "message": RESEND_COPY}

    kind = draft.get("kind")
    if kind == "sales_sheet":
        return _ring_sale(db, {"id": uid}, business, draft)
    if kind == "supplier_note":
        return _file_supplier(db, {"id": uid}, business, draft)
    if kind in ("receipt", "momo_transaction"):
        return {"status": "refused", "message": SHOP_ONLY_REFUSAL}
    return {"status": "nothing", "message": NOTHING_COPY}


def receive_sheet_text(db: Session, profile, text: str, classify_fn=None) -> dict:
    fn = classify_fn or classify_text
    return _receive(db, profile, fn, text)


def receive_sheet_photo(db: Session, profile, image_bytes: bytes, classify_fn=None) -> dict:
    fn = classify_fn or classify_image
    return _receive(db, profile, fn, image_bytes)