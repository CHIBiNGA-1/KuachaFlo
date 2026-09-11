from datetime import date as date_type, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Business, Receipt
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


@router.get("", response_model=BusinessOut)
def get_my_business(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_business(db, user)


@router.post("/expenses", response_model=BusinessLedgerEntryOut)
def create_business_expense(
    payload: BusinessExpenseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Proof-of-concept for the ledger unification: a business expense,
    written into the exact same table a personal receipt lives in —
    direction='out', business_id set, no image required (this is a
    manual entry, not a photo capture; WhatsApp/photo capture into this
    same shape is the next increment once this is proven solid).
    """
    business = _get_business(db, user)

    entry = Receipt(
        user_id=user.id,
        business_id=business.id,
        direction="out",
        merchant=payload.party,
        total_amount=payload.amount,
        currency=payload.currency or business.currency,
        purchase_date=payload.date or datetime.utcnow().date(),
        raw_ocr_text=payload.note,
        status="processed",
        source="business_manual",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/expenses", response_model=list[BusinessLedgerEntryOut])
def list_business_expenses(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    business = _get_business(db, user)
    return (
        db.query(Receipt)
        .filter(
            Receipt.business_id == business.id,
            Receipt.direction == "out",
            Receipt.is_deleted == False,  # noqa: E712
        )
        .order_by(Receipt.purchase_date.desc())
        .all()
    )
