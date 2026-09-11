from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Business, LedgerEntry
from app.schemas import BusinessOut, BusinessExpenseCreate, BusinessLedgerEntryOut

router = APIRouter(prefix="/api/v1/business", tags=["business"])


def _get_business(db: Session, user: User) -> Business:
    business = db.query(Business).filter(Business.owner_user_id == user.id).first()
    if business is None:
        # Normally provisioned by /kratte/sso-url on first "Open My Shop" —
        # this covers calling these endpoints directly before that ever
        # happened, so a business always exists rather than 404ing.
        business = Business(owner_user_id=user.id)
        db.add(business)
        db.commit()
        db.refresh(business)
    return business


def _out(entry: LedgerEntry) -> BusinessLedgerEntryOut:
    # Explicit mapping (not from_attributes): ledger field names differ
    # from the legacy receipt shape this response preserves.
    return BusinessLedgerEntryOut(
        id=entry.id,
        direction=entry.direction,
        merchant=entry.party,
        total_amount=float(entry.amount) if entry.amount is not None else None,
        currency=entry.currency,
        purchase_date=entry.occurred_on,
        source=entry.source,
        line_items=entry.line_items,
        created_at=entry.created_at,
    )


@router.get("", response_model=BusinessOut)
def get_my_business(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_business(db, user)


@router.post("/expenses", response_model=BusinessLedgerEntryOut)
def create_business_expense(
    payload: BusinessExpenseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """A business expense, written into the unified ledger — direction
    'out', business_id set, no image (manual entry, not a photo)."""
    business = _get_business(db, user)

    entry = LedgerEntry(
        user_id=user.id,
        business_id=business.id,
        direction="out",
        party=payload.party,
        amount=payload.amount,
        currency=payload.currency or business.currency,
        occurred_on=payload.date or datetime.utcnow().date(),
        note=payload.note,
        status="processed",
        confidence="high",
        source="shop_manual",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _out(entry)


@router.get("/expenses", response_model=list[BusinessLedgerEntryOut])
def list_business_expenses(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    business = _get_business(db, user)
    rows = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.business_id == business.id,
            LedgerEntry.direction == "out",
            LedgerEntry.is_deleted == False,  # noqa: E712
        )
        .order_by(LedgerEntry.occurred_on.desc())
        .all()
    )
    return [_out(e) for e in rows]
