from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Receipt
from app.schemas import ReceiptOut, ReceiptUpdate
from app.receipt_service import (
    process_receipt_image, ReceiptLimitReached, ReceiptTooLarge, ReceiptUnreadable, ReceiptOcrUnavailable,
)

router = APIRouter(prefix="/api/v1/receipts", tags=["receipts"])

@router.post("", response_model=ReceiptOut)
def upload_receipt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    image_bytes = file.file.read()

    try:
        result = process_receipt_image(db, user, image_bytes)
    except ReceiptLimitReached as e:
        raise HTTPException(
            402,
            f"You've hit the {e.limit}-receipt limit for the {e.plan} plan. Upgrade to keep scanning.",
        )
    except ReceiptTooLarge:
        raise HTTPException(400, "Image must be under 10MB")
    except ReceiptUnreadable as e:
        raise HTTPException(400, str(e))
    except ReceiptOcrUnavailable as e:
        raise HTTPException(503, str(e))

    return result.receipt

@router.get("", response_model=list[ReceiptOut])
def list_receipts(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Receipt).filter(Receipt.user_id == user.id, Receipt.is_deleted == False)

    if q:
        like = f"%{q}%"
        query = query.filter(or_(Receipt.merchant.ilike(like), Receipt.raw_ocr_text.ilike(like)))

    return query.order_by(Receipt.created_at.desc()).all()

@router.get("/{receipt_id}", response_model=ReceiptOut)
def get_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    receipt = _get_owned_receipt(db, receipt_id, user.id)
    return receipt

@router.patch("/{receipt_id}", response_model=ReceiptOut)
def update_receipt(
    receipt_id: str,
    payload: ReceiptUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    receipt = _get_owned_receipt(db, receipt_id, user.id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(receipt, field, value)

    if receipt.merchant and receipt.total_amount:
        receipt.status = "processed"

    db.commit()
    db.refresh(receipt)
    return receipt

@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    receipt = _get_owned_receipt(db, receipt_id, user.id)
    receipt.is_deleted = True  # soft delete
    db.commit()

def _get_owned_receipt(db: Session, receipt_id: str, user_id: str) -> Receipt:
    receipt = (
        db.query(Receipt)
        .filter(Receipt.id == receipt_id, Receipt.user_id == user_id, Receipt.is_deleted == False)
        .first()
    )
    if receipt is None:
        raise HTTPException(404, "Receipt not found")
    return receipt
