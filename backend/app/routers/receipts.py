from datetime import datetime, date

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.models import PersonalReceipt
from app.storage import upload_image
from app.gemini_ocr import extract_receipt, GeminiNotConfigured

router = APIRouter(prefix="/api/receipts", tags=["receipts"])

MAX_FILE_SIZE = 10 * 1024 * 1024


def _parse_date(value: str | None) -> date:
    if value:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            pass
    return date.today()


@router.post("")
def upload_receipt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    image_bytes = file.file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "Image must be under 10MB")

    image_url = upload_image("receipts", user_id, image_bytes, file.content_type)

    try:
        extracted = extract_receipt(image_bytes)
    except GeminiNotConfigured as e:
        raise HTTPException(503, str(e))

    receipt = PersonalReceipt(
        user_id=user_id,
        merchant=extracted["merchant"],
        amount=extracted["amount"],
        currency=extracted["currency"],
        category=extracted["category"],
        purchase_date=_parse_date(extracted["date"]),
        image_url=image_url,
        status="processed" if extracted["amount"] else "needs_review",
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)

    return {
        "id": receipt.id,
        "merchant": receipt.merchant,
        "amount": float(receipt.amount) if receipt.amount is not None else None,
        "currency": receipt.currency,
        "category": receipt.category,
        "purchase_date": str(receipt.purchase_date) if receipt.purchase_date else None,
        "image_url": receipt.image_url,
        "status": receipt.status,
        "created_at": receipt.created_at.isoformat(),
    }


@router.get("")
def list_receipts(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    receipts = (
        db.query(PersonalReceipt)
        .filter(PersonalReceipt.user_id == user_id)
        .order_by(PersonalReceipt.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": r.id,
            "merchant": r.merchant,
            "amount": float(r.amount) if r.amount is not None else None,
            "currency": r.currency,
            "category": r.category,
            "purchase_date": str(r.purchase_date) if r.purchase_date else None,
            "image_url": r.image_url,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in receipts
    ]


@router.delete("/{receipt_id}")
def delete_receipt(receipt_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    receipt = (
        db.query(PersonalReceipt)
        .filter(PersonalReceipt.id == receipt_id, PersonalReceipt.user_id == user_id)
        .first()
    )
    if receipt is None:
        raise HTTPException(404, "Receipt not found")
    db.delete(receipt)
    db.commit()
    return {"ok": True}
