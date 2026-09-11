"""Per-business #SW/#PO counters (port of nextOrderReference)."""

import re

from sqlalchemy.orm import Session

from app.models import Order, OrderSequence

_REF_RE = re.compile(r"^#(?:SW|PO)-(\d{1,12})$")


def next_reference(db: Session, business_id: str, kind: str) -> str:
    """kind: sale|purchase. Allocates the next reference transactionally."""
    prefix = "#SW-" if kind == "sale" else "#PO-"
    floor = 1000 if kind == "sale" else 2000

    row = (
        db.query(OrderSequence)
        .filter(OrderSequence.business_id == business_id, OrderSequence.kind == kind)
        .first()
    )
    if row is not None:
        row.value += 1
        db.flush()
        return f"{prefix}{row.value}"

    highest = floor
    for (ref,) in db.query(Order.reference).filter(
        Order.business_id == business_id, Order.kind == kind
    ).all():
        m = _REF_RE.match(ref or "")
        if m:
            highest = max(highest, int(m.group(1)))
    nxt = highest + 1
    db.add(OrderSequence(business_id=business_id, kind=kind, value=nxt))
    db.flush()
    return f"{prefix}{nxt}"
