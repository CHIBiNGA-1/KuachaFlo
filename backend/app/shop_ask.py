"""Ask the shop a question over WhatsApp.

Capture (shop_capture.py) is the write side: a tally goes in, a sale comes
out. This is the read side — a shop owner standing at the counter with a
customer in front of them can ask "what's low?" or "how'd today go?"
without unlocking a phone and loading the app.

Deliberately a small, fixed vocabulary rather than a general chatbot: the
answers are computed straight from the shop's own rows, so they can't be
wrong the way a generated answer can, and a message that isn't one of
these falls through to the normal capture pipeline untouched.
"""

from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Business, LedgerEntry, Order, Product

# One word, or a short phrase, in the way someone actually texts. Kept
# tight on purpose — anything not listed here is a sales tally, not a
# question, and must reach the capture pipeline unchanged.
LOW_WORDS = {"low", "stock", "low stock", "reorder", "restock", "whats low", "what's low"}
TODAY_WORDS = {"today", "today?", "sales", "sales today", "how today", "today sales"}
WEEK_WORDS = {"week", "this week", "week sales", "weekly"}
HELP_WORDS = {"help", "?", "commands", "menu", "what can you do"}

HELP_COPY = (
    "I can do these:\n"
    "• Send a day-sales tally or till-roll photo — I'll ring it up\n"
    "• *low* — what needs reordering\n"
    "• *today* — today's takings\n"
    "• *week* — the last 7 days\n"
    "Supplier paperwork gets filed as an unpaid expense."
)


def _money(value) -> str:
    return f"K {Decimal(value or 0):,.2f}"


def _low_stock(db: Session, business: Business) -> str:
    rows = (
        db.query(Product)
        .filter(
            Product.business_id == business.id,
            Product.archived.is_(False),
            Product.stock <= Product.reorder_at,
        )
        .order_by(Product.stock.asc())
        .limit(15)
        .all()
    )
    if not rows:
        return "Nothing's below its reorder point — the shelf is in good shape."

    lines = [f"{len(rows)} item{'s' if len(rows) != 1 else ''} to reorder:"]
    for p in rows:
        unit = f" {p.unit}" if p.unit else ""
        out = "out of stock" if p.stock <= 0 else f"{p.stock}{unit} left"
        lines.append(f"• {p.name} — {out} (reorder at {p.reorder_at})")
    return "\n".join(lines)


def _sales_between(db: Session, business: Business, start, end) -> tuple[int, Decimal]:
    row = (
        db.query(func.count(Order.id), func.coalesce(func.sum(Order.amount_total), 0))
        .filter(
            Order.business_id == business.id,
            Order.kind == "sale",
            Order.status == "Completed",
            Order.occurred_on >= start,
            Order.occurred_on <= end,
        )
        .one()
    )
    return int(row[0] or 0), Decimal(row[1] or 0)


def _today(db: Session, business: Business) -> str:
    today = datetime.utcnow().date()
    count, total = _sales_between(db, business, today, today)
    if count == 0:
        return "No sales rung up today yet."
    return (
        f"Today: {_money(total)} across {count} sale{'s' if count != 1 else ''}."
    )


def _week(db: Session, business: Business) -> str:
    today = datetime.utcnow().date()
    start = today - timedelta(days=6)
    count, total = _sales_between(db, business, start, today)
    if count == 0:
        return "No sales in the last 7 days."
    avg = total / count if count else Decimal(0)
    return (
        f"Last 7 days: {_money(total)} across {count} sale"
        f"{'s' if count != 1 else ''} (avg {_money(avg)})."
    )


def try_answer(db: Session, business: Business, text: str) -> str | None:
    """Returns a reply if the text is one of the known questions, else None
    so the caller carries on into the capture pipeline."""
    key = " ".join(text.lower().strip().split())
    if key in HELP_WORDS:
        return HELP_COPY
    if key in LOW_WORDS:
        return _low_stock(db, business)
    if key in TODAY_WORDS:
        return _today(db, business)
    if key in WEEK_WORDS:
        return _week(db, business)
    return None


def low_stock_nudge(db: Session, business: Business, product_ids: list[str]) -> str | None:
    """After a sale rings up, name anything it pushed to/below its reorder
    point. The owner finds out while the shelf is still in front of them,
    instead of the next time they happen to open the app."""
    if not product_ids:
        return None
    rows = (
        db.query(Product)
        .filter(
            Product.id.in_(product_ids),
            Product.archived.is_(False),
            Product.stock <= Product.reorder_at,
        )
        .all()
    )
    if not rows:
        return None
    names = ", ".join(
        f"{p.name} ({'out' if p.stock <= 0 else p.stock} left)" for p in rows
    )
    return f"Heads up — now at reorder level: {names}."
