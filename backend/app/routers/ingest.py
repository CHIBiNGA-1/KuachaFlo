"""App-side capture: photo / pasted text in, entry or question out.

WhatsApp reaches the same pipeline through the webhook — two doors, one
room (see app/ingestion.py).

Status codes are the contract: 201 filed it, 202 needs your answer, 200
nothing to file, 204 cancelled.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.classify import classify_image, classify_text
from app.database import get_db
from app.deps import get_current_user
from app.ingestion import (
    EntryLimitReached, EntryTooLarge, EntryUnreadable, OcrUnavailable,
    answer_draft, cancel_draft, list_drafts, process_image, process_text,
)
from app.models import Category, User
from app.routers.ledger import _out
from app.schemas import LedgerEntryOut

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])


def get_classifier():
    """Injectable seam: tests override this with canned drafts; production
    returns the real Gemini-backed classifiers."""
    return {"image": classify_image, "text": classify_text}


class IngestResult(BaseModel):
    entry: Optional[LedgerEntryOut] = None
    draft_id: Optional[str] = None
    question: Optional[str] = None
    message: Optional[str] = None


class TextIn(BaseModel):
    text: str


class ClarifyIn(BaseModel):
    draft_id: str
    answer: Optional[str] = None
    cancel: bool = False


class DraftOut(BaseModel):
    id: str
    question: str
    created_at: datetime


def _to_result(db: Session, response: Response, outcome) -> IngestResult:
    entry = None
    if outcome.entry is not None:
        cat = (
            db.query(Category).filter(Category.id == outcome.entry.category_id).first()
            if outcome.entry.category_id else None
        )
        entry = _out(outcome.entry, cat)
        response.status_code = 201
    elif outcome.draft_id is not None:
        response.status_code = 202
    else:
        response.status_code = 200
    return IngestResult(
        entry=entry, draft_id=outcome.draft_id,
        question=outcome.question, message=outcome.message,
    )


@router.post("/photo", response_model=IngestResult)
def ingest_photo(
    response: Response,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    classifier=Depends(get_classifier),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    try:
        outcome = process_image(
            db, user, file.file.read(), classifier["image"],
            source="app_photo", sender="app",
        )
    except EntryLimitReached as e:
        raise HTTPException(402, f"You've hit the {e.limit}-entry limit for the {e.plan} plan. Upgrade to keep going.")
    except EntryTooLarge:
        raise HTTPException(400, "Image must be under 10MB")
    except EntryUnreadable as e:
        raise HTTPException(400, str(e))
    except OcrUnavailable as e:
        raise HTTPException(503, str(e))
    return _to_result(db, response, outcome)


@router.post("/text", response_model=IngestResult)
def ingest_text(
    payload: TextIn,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    classifier=Depends(get_classifier),
):
    if not payload.text.strip():
        raise HTTPException(400, "text is required")
    try:
        outcome = process_text(db, user, payload.text, classifier["text"], sender="app")
    except EntryLimitReached as e:
        raise HTTPException(402, f"You've hit the {e.limit}-entry limit for the {e.plan} plan. Upgrade to keep going.")
    except OcrUnavailable as e:
        raise HTTPException(503, str(e))
    if outcome is None:
        return IngestResult(message="Not a transaction — nothing filed.")
    return _to_result(db, response, outcome)


@router.post("/clarify")
def clarify(
    payload: ClarifyIn,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        if payload.cancel:
            cancel_draft(db, user, payload.draft_id)
            response.status_code = 204
            return None
        outcome = answer_draft(db, user, payload.draft_id, payload.answer or "")
    except LookupError:
        raise HTTPException(404, "That draft expired or doesn't exist — send it again.")
    if outcome.entry is None:
        # Follow-up question (or an ignore) — the client keeps one code
        # path: 202 + question, same as the initial thin response.
        response.status_code = 202
        return {"draft_id": outcome.draft_id, "question": outcome.question,
                "message": outcome.message}
    cat = (
        db.query(Category).filter(Category.id == outcome.entry.category_id).first()
        if outcome.entry.category_id else None
    )
    response.status_code = 201
    return _out(outcome.entry, cat)


@router.get("/drafts", response_model=list[DraftOut])
def drafts(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return [
        DraftOut(id=d.id, question=d.question, created_at=d.created_at)
        for d in list_drafts(db, user)
    ]
