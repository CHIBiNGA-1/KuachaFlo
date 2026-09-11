"""Legacy receipts API — thin compatibility adapter over the ledger.

The old frontend speaks ReceiptOut (merchant/total_amount/purchase_date);
the truth lives in LedgerEntry now. Every endpoint here reads/writes the
ledger and translates shapes. No new features land here — new clients use
/api/v1/ledger + /api/v1/ingest. Removed in Phase 5 with the old frontend.
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.classify import classify_image
from app.database import get_db
from app.deps import get_current_user
from app.ingestion import (
    EntryLimitReached, EntryTooLarge, EntryUnreadable, OcrUnavailable,
    force_file_draft, process_image,
)
from app.models import User, LedgerEntry
from app.schemas import ReceiptOut, ReceiptUpdate

router = APIRouter(prefix="/api/v1/receipts", tags=["receipts"])


def _out(e: LedgerEntry) -> ReceiptOut:
    return ReceiptOut(
        id=e.id,
        merchant=e.party,
        purchase_date=e.occurred_on,
        total_amount=float(e.amount) if e.amount is not None else None,
        tax_amount=(e.raw_extraction or {}).get("legacy_tax_amount")
        if isinstance(e.raw_extraction, dict) else None,
        currency=e.currency,
        status=e.status,
        confidence=e.confidence,
        image_path=e.image_path,
        thumbnail_path=e.thumbnail_path,
        category_id=e.category_id,
        created_at=e.created_at,
    )


@router.post("", response_model=ReceiptOut)
def upload_receipt(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    try:
        outcome = process_image(
            db, user, file.file.read(), classify_image,
            source="app_photo", sender="app",
        )
    except EntryLimitReached as e:
        raise HTTPException(
            402,
            f"You've hit the {e.limit}-entry limit for the {e.plan} plan. Upgrade to keep scanning.",
        )
    except EntryTooLarge:
        raise HTTPException(400, "Image must be under 10MB")
    except EntryUnreadable as e:
        raise HTTPException(400, str(e))
    except OcrUnavailable as e:
        raise HTTPException(503, str(e))

    if outcome.entry is not None:
        return _out(outcome.entry)

    # The old client can't ask questions — a thin photo becomes a
    # needs_review row (exactly today's UX for uncertain scans) with the
    # question preserved so the new client can still pick it up.
    if outcome.draft_id:
        return _out(force_file_draft(db, user, outcome.draft_id, outcome.question or ""))
    raise HTTPException(422, outcome.message or "Couldn't make sense of that photo.")


@router.get("", response_model=list[ReceiptOut])
def list_receipts(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(LedgerEntry).filter(
        LedgerEntry.user_id == user.id,
        LedgerEntry.business_id.is_(None),
        LedgerEntry.is_deleted == False,  # noqa: E712
    )
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            LedgerEntry.party.ilike(like),
            LedgerEntry.note.ilike(like),
        ))
    return [_out(e) for e in query.order_by(LedgerEntry.created_at.desc()).all()]


@router.get("/{receipt_id}", response_model=ReceiptOut)
def get_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _out(_get_owned_receipt(db, receipt_id, user.id))


@router.patch("/{receipt_id}", response_model=ReceiptOut)
def update_receipt(
    receipt_id: str,
    payload: ReceiptUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = _get_owned_receipt(db, receipt_id, user.id)
    data = payload.model_dump(exclude_unset=True)

    field_map = {
        "merchant": "party", "purchase_date": "occurred_on",
        "total_amount": "amount", "currency": "currency",
        "category_id": "category_id",
    }
    for old, new in field_map.items():
        if old in data:
            setattr(entry, new, data[old])
    if "tax_amount" in data and data["tax_amount"] is not None:
        raw = dict(entry.raw_extraction or {})
        raw["legacy_tax_amount"] = data["tax_amount"]
        entry.raw_extraction = raw

    if entry.party and entry.amount:
        entry.status = "processed"

    db.commit()
    db.refresh(entry)
    return _out(entry)


@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = _get_owned_receipt(db, receipt_id, user.id)
    entry.is_deleted = True  # soft delete
    db.commit()


def _get_owned_receipt(db: Session, receipt_id: str, user_id: str) -> LedgerEntry:
    entry = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.id == receipt_id, LedgerEntry.user_id == user_id,
                LedgerEntry.business_id.is_(None),
                LedgerEntry.is_deleted == False)  # noqa: E712
        .first()
    )
    if entry is None:
        raise HTTPException(404, "Receipt not found")
    return entry
