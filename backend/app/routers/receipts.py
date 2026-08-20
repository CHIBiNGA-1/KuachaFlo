from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User, Receipt, Category
from app.schemas import ReceiptOut, ReceiptUpdate
from app.storage import save_receipt_image
from app.gemini_ocr import extract_receipt_data, GeminiNotConfigured

router = APIRouter(prefix="/api/v1/receipts", tags=["receipts"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@router.post("", response_model=ReceiptOut)
def upload_receipt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    # Server-side plan enforcement — the dashboard's "X of 100" is cosmetic
    # only; this is the real gate. Checked before the Gemini call so a
    # blocked upload doesn't burn an API call.
    limit = settings.plan_limits.get(user.plan)
    if limit is not None:
        current_count = (
            db.query(Receipt)
            .filter(Receipt.user_id == user.id, Receipt.is_deleted == False)  # noqa: E712
            .count()
        )
        if current_count >= limit:
            raise HTTPException(
                402,
                f"You've hit the {limit}-receipt limit for the {user.plan} plan. "
                f"Upgrade to keep scanning.",
            )

    image_bytes = file.file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "Image must be under 10MB")

    # 1. Save to local disk (original + thumbnail)
    image_path, thumbnail_path = save_receipt_image(image_bytes, user.id)

    # 2. OCR + auto-categorization in one Gemini call. Runs over the network,
    # not on this machine's CPU — no more torch/tesseract/hardware issues.
    categories = db.query(Category).all()
    category_by_name = {c.name: c for c in categories}

    try:
        extracted = extract_receipt_data(image_bytes, list(category_by_name.keys()))
    except GeminiNotConfigured as e:
        raise HTTPException(503, str(e))

    matched_category = category_by_name.get(extracted.get("category_name"))

    # 3. Persist
    receipt = Receipt(
        user_id=user.id,
        category_id=matched_category.id if matched_category else None,
        image_path=image_path,
        thumbnail_path=thumbnail_path,
        merchant=extracted["merchant"],
        purchase_date=extracted["purchase_date"],
        total_amount=extracted["total_amount"],
        tax_amount=extracted["tax_amount"],
        currency=extracted["currency"],
        raw_ocr_text=extracted["raw_ocr_text"],
        status=extracted["status"],
        confidence=extracted["confidence"],
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)

    return receipt

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
