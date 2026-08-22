"""
The actual "photo → structured receipt" pipeline, factored out of the HTTP
upload endpoint so the WhatsApp webhook can run the exact same logic —
same plan enforcement, same OCR call, same storage, same DB row. Two
entry points, one pipeline; no divergent behaviour to keep in sync.
"""

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, Receipt, Category
from app.storage import save_receipt_image
from app.gemini_ocr import extract_receipt_data, GeminiNotConfigured

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


class ReceiptLimitReached(Exception):
    def __init__(self, plan: str, limit: int):
        self.plan = plan
        self.limit = limit
        super().__init__(f"{plan} plan limit of {limit} receipts reached")


class ReceiptTooLarge(Exception):
    pass


class ReceiptUnreadable(Exception):
    """Bytes arrived but Pillow couldn't decode them as an image at all —
    distinct from ReceiptOcrUnavailable, which is Gemini being unreachable
    on a perfectly valid image."""


class ReceiptOcrUnavailable(Exception):
    pass


@dataclass
class ProcessedReceipt:
    receipt: Receipt
    matched_category_name: str | None


def process_receipt_image(db: Session, user: User, image_bytes: bytes) -> ProcessedReceipt:
    """
    Runs plan enforcement + OCR + storage + persistence for one receipt
    image, for an already-identified user. Every failure path raises one
    of this module's own exception types — never a raw HTTPException —
    so callers (an HTTP route, a WhatsApp webhook, anything else later)
    can each translate failures into whatever response shape fits them,
    without a lower layer's assumptions (e.g. "return a 400") leaking
    into a context where that assumption doesn't hold.
    """
    limit = settings.plan_limits.get(user.plan)
    if limit is not None:
        current_count = (
            db.query(Receipt)
            .filter(Receipt.user_id == user.id, Receipt.is_deleted == False)  # noqa: E712
            .count()
        )
        if current_count >= limit:
            raise ReceiptLimitReached(user.plan, limit)

    if len(image_bytes) > MAX_FILE_SIZE:
        raise ReceiptTooLarge()

    try:
        image_path, thumbnail_path = save_receipt_image(image_bytes, user.id)
    except HTTPException as e:
        if e.status_code == 400:
            raise ReceiptUnreadable(e.detail)
        raise  # a genuine 502 storage failure — let it surface as a real 500, don't mask it

    categories = db.query(Category).all()
    category_by_name = {c.name: c for c in categories}

    try:
        extracted = extract_receipt_data(image_bytes, list(category_by_name.keys()))
    except GeminiNotConfigured as e:
        raise ReceiptOcrUnavailable(str(e))

    matched_category = category_by_name.get(extracted.get("category_name"))

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

    return ProcessedReceipt(receipt=receipt, matched_category_name=matched_category.name if matched_category else None)
