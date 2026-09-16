"""Shop expenses: money out that isn't stock.

Stored as ledger rows (direction=out, source=shop_expense) on the
business — the one ledger stays one. Paid/Unpaid and the payment method
ride in raw JSON: LedgerEntry.status is the Personal review flag and
must never be overloaded on the shop side.

Order money (source=shop_order) is invisible here: get_owned only ever
resolves shop_expense rows, so an expense edit can never touch the
till's money.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import LedgerEntry
from app.shop import validate as v
from app.shop.errors import NotFound

SOURCE = "shop_expense"

ALLOWED = {"name", "amount", "category", "date", "method", "paid", "notes"}

EXPENSE_CATEGORIES = [
    "Rent", "Utilities", "Payroll", "Marketing",
    "Supplies", "Shipping", "Transport", "Other",
]
PAYMENT_METHODS = ["Cash", "Mobile money", "Bank transfer", "Card", "Other"]
PAID_STATUSES = ["Paid", "Unpaid"]


def _meta(row: LedgerEntry) -> tuple[str, str]:
    raw = row.raw or {}
    method = raw.get("method") or "Cash"
    paid = raw.get("paid") or "Paid"
    return method, paid


def serialize(row: LedgerEntry) -> dict:
    method, paid = _meta(row)
    return {
        "id": row.id,
        "name": row.party or "",
        "amount": float(row.amount or 0),
        "category": row.category or "Other",
        "date": row.occurred_on.isoformat() if row.occurred_on else None,
        "method": method,
        "paid": paid,
        "notes": row.note or "",
    }


def list_expenses(db: Session, business_id: str, limit: int = 200) -> dict:
    rows = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.business_id == business_id,
                LedgerEntry.source == SOURCE,
                LedgerEntry.is_deleted.is_(False))
        .order_by(LedgerEntry.occurred_on.desc(), LedgerEntry.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"items": [serialize(r) for r in rows], "next_cursor": None}


def get_owned(db: Session, business_id: str, expense_id: str) -> LedgerEntry:
    # No uuid_value check: ledger ids are hex, not dashed. A bad id
    # simply resolves to nothing — which is a 404 either way.
    row = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.id == expense_id,
                LedgerEntry.business_id == business_id,
                LedgerEntry.source == SOURCE,
                LedgerEntry.is_deleted.is_(False))
        .first()
    )
    if row is None:
        raise NotFound("This expense no longer exists.")
    return row


def create_expense(db: Session, user: dict, business, payload: dict) -> LedgerEntry:
    v.allowed_keys(payload, sorted(ALLOWED))
    row = LedgerEntry(
        user_id=user["id"],
        business_id=business.id,
        direction="out",
        amount=v.money(payload.get("amount"), "Amount", minimum=0.01),
        currency=business.currency or "ZMW",
        party=v.text(payload.get("name"), "Expense name", min_len=1, max_len=500, required=True),
        category=v.choice(payload.get("category"), EXPENSE_CATEGORIES, "Category",
                          fallback="Other"),
        occurred_on=v.date_value(
            payload.get("date") or datetime.utcnow().date().isoformat(), "Date"),
        note=v.text(payload.get("notes"), "Notes", max_len=2000) or None,
        source=SOURCE,
        status="processed",
        raw={
            "method": v.choice(payload.get("method"), PAYMENT_METHODS, "Payment method",
                               fallback="Cash"),
            "paid": v.choice(payload.get("paid"), PAID_STATUSES, "Payment status",
                             fallback="Paid"),
        },
    )
    db.add(row)
    db.flush()
    return row


def update_expense(db: Session, business_id: str, expense_id: str, payload: dict) -> LedgerEntry:
    v.allowed_keys(payload, sorted(ALLOWED))
    row = get_owned(db, business_id, expense_id)
    if "name" in payload:
        row.party = v.text(payload["name"], "Expense name", min_len=1, max_len=500, required=True)
    if "amount" in payload:
        row.amount = v.money(payload["amount"], "Amount", minimum=0.01)
    if "category" in payload:
        row.category = v.choice(payload["category"], EXPENSE_CATEGORIES, "Category")
    if "date" in payload:
        row.occurred_on = v.date_value(payload["date"], "Date")
    if "notes" in payload:
        row.note = v.text(payload["notes"], "Notes", max_len=2000) or None
    if "method" in payload or "paid" in payload:
        raw = dict(row.raw or {})
        if "method" in payload:
            raw["method"] = v.choice(payload["method"], PAYMENT_METHODS, "Payment method")
        if "paid" in payload:
            raw["paid"] = v.choice(payload["paid"], PAID_STATUSES, "Payment status")
        row.raw = raw
    db.flush()
    return row


def delete_expense(db: Session, business_id: str, expense_id: str) -> None:
    row = get_owned(db, business_id, expense_id)
    row.is_deleted = True
    db.flush()