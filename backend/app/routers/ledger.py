from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Business, Receipt
from app.schemas import LedgerEntryOut

router = APIRouter(prefix="/api/v1/ledger", tags=["ledger"])


@router.get("", response_model=list[LedgerEntryOut])
def get_ledger(
    context: Literal["all", "personal", "business"] = Query("all"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    The first real, visible proof of the unified data model: every
    receipt and every business entry for this user, in one place, sorted
    together — a photographed lunch receipt and a shop sale sit in the
    exact same list, just tagged differently. This is what "one
    dashboard" actually depends on existing; the frontend work to
    surface this is the next phase, not this step.
    """
    query = db.query(Receipt).filter(Receipt.user_id == user.id, Receipt.is_deleted == False)  # noqa: E712

    if context == "personal":
        query = query.filter(Receipt.business_id.is_(None))
    elif context == "business":
        query = query.filter(Receipt.business_id.isnot(None))

    entries = query.order_by(Receipt.purchase_date.desc(), Receipt.created_at.desc()).limit(500).all()

    return [
        LedgerEntryOut(
            id=e.id,
            context="business" if e.business_id else "personal",
            direction=e.direction,
            merchant=e.merchant,
            total_amount=e.total_amount,
            currency=e.currency,
            purchase_date=e.purchase_date,
            category_id=e.category_id,
            source=e.source,
            line_items=e.line_items,
            created_at=e.created_at,
        )
        for e in entries
    ]


@router.get("/summary")
def get_ledger_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Quick totals for a combined-view dashboard card — personal spend,
    business income, business spend, all from the one table."""
    entries = (
        db.query(Receipt)
        .filter(Receipt.user_id == user.id, Receipt.is_deleted == False)  # noqa: E712
        .all()
    )

    personal_out = sum(e.total_amount or 0 for e in entries if not e.business_id and e.direction == "out")
    business_in = sum(e.total_amount or 0 for e in entries if e.business_id and e.direction == "in")
    business_out = sum(e.total_amount or 0 for e in entries if e.business_id and e.direction == "out")
    has_business = db.query(Business).filter(Business.owner_user_id == user.id).first() is not None

    return {
        "personal_spend": personal_out,
        "business_income": business_in,
        "business_spend": business_out,
        "has_business": has_business,
    }
