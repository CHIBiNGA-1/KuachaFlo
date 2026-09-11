"""The mouth: one pipeline for every money input.

Bytes or text in → memory check → ONE classify call → committed ledger
entry, stored draft + question, or clean not-money. Every failure path
raises this module's own exceptions (never HTTPException) so callers —
an HTTP route, the WhatsApp webhook — translate them into whatever
response fits their context.

Replaces receipt_service.py (photo+text pipelines) — one pipeline, one
writer, no divergent behaviour.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.classify import ClassifyFailed, GeminiNotConfigured
from app.config import settings
from app.memory import lookup, normalize_party, remember
from app.models import (
    Business, Category, LedgerEntry, User, WhatsAppPendingClarification,
)
from app.storage import save_receipt_image

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
CLARIFICATION_TTL_HOURS = 24
MAX_CLARIFY_ATTEMPTS = 2


class EntryLimitReached(Exception):
    def __init__(self, plan: str, limit: int):
        self.plan = plan
        self.limit = limit
        super().__init__(f"{plan} plan limit of {limit} entries reached")


class EntryTooLarge(Exception):
    pass


class EntryUnreadable(Exception):
    """Bytes arrived but Pillow couldn't decode them as an image at all."""


class OcrUnavailable(Exception):
    pass


@dataclass
class IngestOutcome:
    entry: LedgerEntry | None = None       # committed
    draft_id: str | None = None            # thin — question asked
    question: str | None = None
    message: str | None = None             # human line for not_money / needs_shop
    needs_shop: bool = False               # sales sheet but no business yet


def check_entry_limit(db: Session, user: User) -> None:
    limit = settings.plan_limits.get(user.plan)
    if limit is None:
        return
    current = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.user_id == user.id, LedgerEntry.is_deleted == False)  # noqa: E712
        .count()
    )
    if current >= limit:
        raise EntryLimitReached(user.plan, limit)


def _resolve_category(db: Session, value: str | None) -> Category | None:
    """Matches a model slug OR a human name ('Meals & Food', 'meals')."""
    if not value or not str(value).strip():
        return None
    text = str(value).strip()
    cat = db.query(Category).filter(Category.slug == text.lower().replace(" ", "-")).first()
    if cat is None:
        cat = db.query(Category).filter(func_lower(Category.name) == text.lower()).first()
    return cat


def func_lower(col):
    from sqlalchemy import func
    return func.lower(col)


def _memory_boost(db: Session, user: User, draft: dict) -> dict:
    """Fills gaps from learned rules; a known party files silently."""
    if not draft.get("party"):
        return draft
    mem = lookup(db, user.id, draft["party"])
    if mem is None:
        return draft
    draft = dict(draft)
    if draft.get("category") is None and mem.category_id:
        cat = db.query(Category).filter(Category.id == mem.category_id).first()
        if cat is not None:
            draft["category"] = cat.slug
    if draft.get("context_hint") is None and mem.context:
        draft["context_hint"] = mem.context
    if draft.get("confidence") == "low":
        draft["confidence"] = "medium"  # known party — trust the memory
    draft["_memory_id"] = mem.id
    return draft


def _default_question(draft: dict) -> str:
    amt = draft.get("amount")
    money = f"K{amt:,.0f}" if amt else "this"
    who = f" to {draft['party']}" if draft.get("party") else ""
    return f"What was {money}{who} for?"


def _complete(draft: dict) -> bool:
    if draft["kind"] == "not_money" or not draft.get("amount"):
        return False
    if not draft.get("party") and draft["kind"] not in ("sales_sheet",):
        return False
    return draft.get("confidence") in ("high", "medium")


def _business_for(db: Session, user: User) -> Business | None:
    return db.query(Business).filter(Business.owner_user_id == user.id).first()


def ingest_draft(
    db: Session,
    user: User,
    draft: dict,
    *,
    source: str,
    sender: str | None = None,
    image_path: str | None = None,
    thumbnail_path: str | None = None,
) -> IngestOutcome:
    """Files one classified draft: commit, question, not-money, or needs-shop."""
    check_entry_limit(db, user)

    if draft["kind"] == "not_money":
        return IngestOutcome(message="Noted — send a receipt, a MoMo alert, or a sales sheet anytime.")

    draft = _memory_boost(db, user, draft)

    # Sales sheets are unambiguously business. Without a shop there is
    # nowhere honest to file one — say so instead of guessing.
    if draft["kind"] == "sales_sheet" and _business_for(db, user) is None:
        return IngestOutcome(
            needs_shop=True,
            message="This looks like a sales sheet — start your shop in the app and send it again.",
        )

    if not _complete(draft):
        expires = datetime.utcnow() + timedelta(hours=CLARIFICATION_TTL_HOURS)
        row = WhatsAppPendingClarification(
            user_id=user.id, chat_sender=sender,
            draft_entry={**draft, "source": source, "image_path": image_path,
                         "thumbnail_path": thumbnail_path},
            question=draft.get("needs_question") or _default_question(draft),
            expires_at=expires,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return IngestOutcome(draft_id=row.id, question=row.question)

    return IngestOutcome(entry=_commit(db, user, draft, source, image_path, thumbnail_path))


def _commit(
    db: Session, user: User, draft: dict, source: str,
    image_path: str | None = None, thumbnail_path: str | None = None,
    note: str | None = None, force_review: bool = False,
) -> LedgerEntry:
    kind = draft["kind"]
    business = _business_for(db, user)

    if kind in ("sales_sheet", "supplier_note"):
        context = "business" if business else "personal"
    else:
        context = draft.get("context_hint") or "personal"
        if context == "business" and business is None:
            context = "personal"  # auto-file never 422s — user can flip later

    direction = draft.get("direction") or ("in" if kind == "sales_sheet" else "out")

    occurred = None
    if draft.get("occurred_on"):
        try:
            occurred = datetime.strptime(draft["occurred_on"], "%Y-%m-%d").date()
        except ValueError:
            occurred = None
    if occurred is None and (kind in ("momo_transaction", "sales_sheet") or source == "whatsapp_momo_text"):
        occurred = datetime.utcnow().date()  # SMS text rarely carries a reliable date

    cat = _resolve_category(db, draft.get("category"))

    status = "needs_review" if (force_review or draft.get("confidence") == "low") else "processed"
    entry_note = note
    if kind == "sales_sheet":
        # Phase 2 records the income + preserves every line item; the
        # Phase 3 shop port sweeps sales_sheet rows into real orders with
        # stock effects. Marked review so the income is never silent.
        status = "needs_review"
        entry_note = (note + " " if note else "") + "Sales sheet — stock sync arrives with the shop."
        if draft.get("party") in (None, "", "Day sales"):
            draft = {**draft, "party": "Day sales"}

    entry = LedgerEntry(
        user_id=user.id,
        business_id=business.id if context == "business" and business else None,
        direction=direction,
        amount=draft.get("amount"),
        currency=draft.get("currency") or user.currency or "ZMW",
        party=draft.get("party"),
        category_id=cat.id if cat else None,
        occurred_on=occurred,
        note=entry_note,
        source=source,
        image_path=image_path,
        thumbnail_path=thumbnail_path,
        raw_extraction=draft.get("raw"),
        status=status,
        confidence=draft.get("confidence"),
        line_items=draft.get("line_items"),
        memory_id=draft.get("_memory_id"),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def process_image(
    db: Session, user: User, image_bytes: bytes,
    classify_fn, *, source: str, sender: str | None = None,
) -> IngestOutcome:
    """Full photo path: limit → size → storage → classify → file."""
    check_entry_limit(db, user)
    if len(image_bytes) > MAX_FILE_SIZE:
        raise EntryTooLarge()
    try:
        image_path, thumbnail_path = save_receipt_image(image_bytes, user.id)
    except HTTPException as e:
        if e.status_code == 400:
            raise EntryUnreadable(str(e.detail))
        raise

    slugs = [c.slug for c in db.query(Category).all()]
    try:
        draft = classify_fn(image_bytes, slugs)
    except GeminiNotConfigured as e:
        raise OcrUnavailable(str(e))
    except ClassifyFailed as e:
        # A photo with a dead scanner still becomes a row the user can
        # fill in by hand — the upload itself must never 500.
        entry = LedgerEntry(
            user_id=user.id, direction="out", currency=user.currency or "ZMW",
            source=source, image_path=image_path, thumbnail_path=thumbnail_path,
            status="needs_review", confidence="low",
            note="Scan failed — fill in by hand.",
            raw_extraction={"error": str(e)},
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return IngestOutcome(entry=entry)

    return ingest_draft(db, user, draft, source=source, sender=sender,
                        image_path=image_path, thumbnail_path=thumbnail_path)


def process_text(
    db: Session, user: User, text: str,
    classify_fn, *, sender: str | None = None,
) -> IngestOutcome | None:
    """Full forwarded-text path. Returns None when the text isn't money
    AND no draft is open — an expected outcome, not a failure."""
    check_entry_limit(db, user)
    slugs = [c.slug for c in db.query(Category).all()]
    try:
        draft = classify_fn(text, slugs)
    except GeminiNotConfigured as e:
        raise OcrUnavailable(str(e))
    except ClassifyFailed:
        return None  # stay quiet — this may never have been a transaction
    return ingest_draft(db, user, draft, source="whatsapp_momo_text", sender=sender)


def list_drafts(db: Session, user: User) -> list[WhatsAppPendingClarification]:
    now = datetime.utcnow()
    return (
        db.query(WhatsAppPendingClarification)
        .filter(WhatsAppPendingClarification.user_id == user.id,
                WhatsAppPendingClarification.expires_at > now)
        .order_by(WhatsAppPendingClarification.created_at.desc())
        .all()
    )


def get_open_draft(db: Session, user: User) -> WhatsAppPendingClarification | None:
    rows = list_drafts(db, user)
    return rows[0] if rows else None


def answer_draft(db: Session, user: User, draft_id: str, answer: str) -> IngestOutcome:
    """Applies a clarification answer: category match commits immediately;
    anything else gets one follow-up, then files as needs_review."""
    row = (
        db.query(WhatsAppPendingClarification)
        .filter(WhatsAppPendingClarification.id == draft_id,
                WhatsAppPendingClarification.user_id == user.id)
        .first()
    )
    if row is None or (row.expires_at and row.expires_at <= datetime.utcnow()):
        raise LookupError("draft not found or expired")

    draft = dict(row.draft_entry)
    answer = (answer or "").strip()
    lowered = normalize_party(answer)

    if lowered in ("cancel", "ignore", "stop"):
        db.delete(row)
        db.commit()
        return IngestOutcome(message="Ignored — nothing filed.")

    if lowered in ("personal", "business"):
        draft["context_hint"] = lowered
    else:
        cat = _resolve_category(db, answer)
        if cat is not None:
            draft["category"] = cat.slug
        elif row.attempts >= MAX_CLARIFY_ATTEMPTS - 1:
            # Second strike — file honestly as needs_review with the
            # human's words preserved, and stop asking.
            entry = _commit(db, user, draft, draft.get("source", "app_manual"),
                            draft.get("image_path"), draft.get("thumbnail_path"),
                            note=f"Unclear: {answer}", force_review=True)
            remember(db, user.id, draft.get("party") or "", entry.category_id,
                     "business" if entry.business_id else "personal")
            db.delete(row)
            db.commit()
            return IngestOutcome(entry=entry)
        else:
            row.attempts = (row.attempts or 0) + 1
            row.question = (
                f"Got it — '{answer}' doesn't match a category. "
                "Which one fits best — e.g. Meals, Fuel, Rent, Supplies?"
            )
            db.commit()
            db.refresh(row)
            return IngestOutcome(draft_id=row.id, question=row.question)

    draft["confidence"] = "medium"  # a human answered — trust it
    entry = _commit(db, user, draft, draft.get("source", "app_manual"),
                    draft.get("image_path"), draft.get("thumbnail_path"))
    remember(db, user.id, draft.get("party") or "", entry.category_id,
             "business" if entry.business_id else "personal")
    db.delete(row)
    db.commit()
    return IngestOutcome(entry=entry)


def force_file_draft(db: Session, user: User, draft_id: str, note: str) -> LedgerEntry:
    """Files a draft as needs_review without asking — for clients too old
    to hold a conversation (legacy receipts upload). The question is
    preserved in the note so the new client can still resolve it."""
    row = (
        db.query(WhatsAppPendingClarification)
        .filter(WhatsAppPendingClarification.id == draft_id,
                WhatsAppPendingClarification.user_id == user.id)
        .first()
    )
    if row is None:
        raise LookupError("draft not found")
    draft = dict(row.draft_entry)
    entry = _commit(db, user, draft, draft.get("source", "app_manual"),
                    draft.get("image_path"), draft.get("thumbnail_path"),
                    note=note or row.question, force_review=True)
    db.delete(row)
    db.commit()
    return entry


def cancel_draft(db: Session, user: User, draft_id: str) -> None:
    row = (
        db.query(WhatsAppPendingClarification)
        .filter(WhatsAppPendingClarification.id == draft_id,
                WhatsAppPendingClarification.user_id == user.id)
        .first()
    )
    if row is None:
        raise LookupError("draft not found")
    db.delete(row)
    db.commit()
