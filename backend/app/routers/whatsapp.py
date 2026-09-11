"""WhatsApp capture: one number, one user, one pipeline.

Content decides what a message IS (receipt, MoMo alert, sales sheet,
chit-chat); the linked account only decides whose books it lands in.
There is no KraTte-side linking anymore — one number → one user → one
ledger (blueprint §12).
"""

import logging
import random
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.classify import classify_image, classify_text
from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.ingestion import (
    EntryLimitReached, EntryTooLarge, EntryUnreadable, OcrUnavailable,
    answer_draft, get_open_draft, process_image, process_text,
)
from app.models import Category, User, WhatsAppPendingClarification, WhatsAppProcessedMessage
from app.schemas import WhatsAppLinkCodeOut
from app.whatsapp import verify_signature, send_text, download_media

router = APIRouter(tags=["whatsapp"])

LINK_CODE_TTL_MINUTES = 15

LINK_COPY = (
    "👋 To link this number, open KuachaFlo → You → WhatsApp, "
    "grab your 6-digit code, and send it here."
)
WELCOME_COPY = (
    "✅ Linked! Send a receipt photo, forward a MoMo alert, "
    "or snap your sales sheet — I'll sort it into your books."
)
FALLBACK_COPY = (
    "Send a photo of a receipt, forward a MoMo/bank alert, "
    "or snap your sales sheet — that's what I'm best at."
)
LIMIT_COPY = (
    "That looks like money movement, but you're at the {limit}-entry "
    "limit on the {plan} plan. Upgrade in the app to keep going."
)


# ── Account linking (called from the app) ──────────────────────────────

@router.post("/api/v1/account/whatsapp/link-code", response_model=WhatsAppLinkCodeOut)
def generate_link_code(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    code = "".join(random.choices(string.digits, k=6))
    user.whatsapp_link_code = code
    user.whatsapp_link_code_expires = datetime.utcnow() + timedelta(minutes=LINK_CODE_TTL_MINUTES)
    db.commit()

    return WhatsAppLinkCodeOut(
        code=code,
        expires_in_minutes=LINK_CODE_TTL_MINUTES,
        whatsapp_number=settings.whatsapp_display_number,
        already_linked=bool(user.whatsapp_number),
    )


@router.delete("/api/v1/account/whatsapp/link", status_code=204)
def unlink_whatsapp(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.whatsapp_number = None
    user.whatsapp_link_code = None
    user.whatsapp_link_code_expires = None
    db.commit()


# ── Meta webhook ────────────────────────────────────────────────────────

@router.get("/api/v1/whatsapp/webhook")
def verify_webhook(request: Request):
    """Meta calls this once, at setup time, to confirm you control the
    endpoint. Echo hub.challenge back only if the verify token matches."""
    params = request.query_params
    if (
        params.get("hub.mode") == "subscribe"
        and settings.whatsapp_verify_token
        and params.get("hub.verify_token") == settings.whatsapp_verify_token
    ):
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    raise HTTPException(403, "Verification failed")


@router.post("/api/v1/whatsapp/webhook")
async def receive_webhook(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()

    if not verify_signature(raw_body, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(401, "Invalid signature")

    payload = await request.json()

    try:
        entry = payload["entry"][0]["changes"][0]["value"]
        messages = entry.get("messages")
        if not messages:
            # Delivery/read receipts and other non-message events land here too.
            return {"status": "ignored"}

        message = messages[0]
        sender = message["from"]  # WhatsApp number, no '+', e.g. "260772157122"
        message_id = message.get("id")
    except (KeyError, IndexError):
        logging.warning("Unrecognised WhatsApp webhook payload shape")
        return {"status": "ignored"}

    # Meta retries a webhook delivery if it doesn't get a fast 200 — a slow
    # Gemini call is enough to trigger a retry, which would otherwise log
    # the same entry 2-3 times. Claim the message_id BEFORE any
    # processing starts, so even an overlapping retry gets blocked
    # immediately rather than racing the first attempt.
    if message_id:
        db.add(WhatsAppProcessedMessage(message_id=message_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return {"status": "duplicate"}

    _handle_message(db, sender, message)
    return {"status": "ok"}


# ── Message handling (content-first) ────────────────────────────────────

def _confirm_line(db: Session, entry) -> str:
    amount = (
        f"{entry.currency or ''} {float(entry.amount):,.2f}".strip()
        if entry.amount is not None else "amount unclear"
    )
    cat = (
        db.query(Category).filter(Category.id == entry.category_id).first()
        if entry.category_id else None
    )
    cat_name = cat.name if cat else "uncategorised"
    who = entry.party or "entry"
    scope = " · shop" if entry.business_id else ""
    review = " (needs a quick review — tap it in Money)" if entry.status == "needs_review" else ""
    return f"✅ Logged: {who} — {amount} ({cat_name}){scope}{review}"


def _prune_expired_drafts(db: Session, user: User) -> None:
    db.query(WhatsAppPendingClarification).filter(
        WhatsAppPendingClarification.user_id == user.id,
        WhatsAppPendingClarification.expires_at <= datetime.utcnow(),
    ).delete()
    db.commit()


def _handle_message(db: Session, sender: str, message: dict) -> None:
    msg_type = message.get("type")
    user = db.query(User).filter(User.whatsapp_number == sender).first()

    # --- linking: a 6-digit code as plain text (linked or not) ---
    if msg_type == "text" and message["text"]["body"].strip().isdigit() \
            and len(message["text"]["body"].strip()) == 6:
        if not _try_link(db, sender, message["text"]["body"].strip()):
            send_text(sender, "That code's wrong or expired — grab a fresh one from KuachaFlo → You → WhatsApp.")
        return

    if user is None:
        if msg_type == "image":
            send_text(sender, f"{LINK_COPY} Then send the photo again.")
        else:
            send_text(sender, LINK_COPY)
        return

    _prune_expired_drafts(db, user)

    if msg_type == "text":
        _handle_text(db, user, sender, message["text"]["body"])
    elif msg_type == "image":
        _handle_image(db, user, sender, message)
    else:
        send_text(sender, FALLBACK_COPY)


def _handle_text(db: Session, user: User, sender: str, text_body: str) -> None:
    text_body = (text_body or "").strip()
    if not text_body:
        return

    # A reply to our question takes precedence over re-classifying — but
    # only when it doesn't look like a fresh transaction itself. The
    # classifier is the judge: not_money + open draft = answer.
    draft = get_open_draft(db, user)
    lowered = text_body.strip().lower()
    if draft is not None and lowered in ("cancel", "ignore", "stop"):
        answer_draft(db, user, draft.id, text_body)
        send_text(sender, "Ignored — nothing filed.")
        return

    try:
        outcome = process_text(db, user, text_body, classify_text, sender=sender)
    except EntryLimitReached as e:
        send_text(sender, LIMIT_COPY.format(limit=e.limit, plan=e.plan))
        return
    except OcrUnavailable:
        outcome = None  # stay quiet-ish — fall through to draft/fallback below

    if outcome is not None and outcome.entry is not None:
        send_text(sender, _confirm_line(db, outcome.entry))
        return
    if outcome is not None and outcome.draft_id is not None:
        send_text(sender, outcome.question or "What was this for?")
        return
    if outcome is not None and outcome.needs_shop:
        send_text(sender, outcome.message or "Start your shop to file sales sheets.")
        return

    # Not a transaction — maybe an answer to our open question?
    if draft is not None:
        try:
            answered = answer_draft(db, user, draft.id, text_body)
        except LookupError:
            send_text(sender, FALLBACK_COPY)
            return
        if answered.entry is not None:
            send_text(sender, _confirm_line(db, answered.entry))
        elif answered.draft_id:
            send_text(sender, answered.question or "Which category fits best?")
        else:
            send_text(sender, answered.message or "Noted.")
        return

    send_text(sender, FALLBACK_COPY)


def _handle_image(db: Session, user: User, sender: str, message: dict) -> None:
    image_bytes = download_media(message["image"]["id"])
    if image_bytes is None:
        send_text(sender, "⚠️ Couldn't download that image — try sending it again.")
        return

    try:
        outcome = process_image(
            db, user, image_bytes, classify_image,
            source="whatsapp_photo", sender=sender,
        )
    except EntryLimitReached as e:
        send_text(sender, LIMIT_COPY.format(limit=e.limit, plan=e.plan))
        return
    except EntryTooLarge:
        send_text(sender, "That image is too large (10MB max) — try a lower-res photo.")
        return
    except EntryUnreadable:
        send_text(sender, "⚠️ Couldn't read that as an image — try sending it as a photo, not a document.")
        return
    except OcrUnavailable:
        send_text(sender, "⚠️ Scanning is temporarily unavailable — try again shortly.")
        return

    if outcome.entry is not None:
        send_text(sender, _confirm_line(db, outcome.entry))
    elif outcome.draft_id is not None:
        send_text(sender, outcome.question or "What was this for?")
    else:
        send_text(sender, outcome.message or FALLBACK_COPY)


def _try_link(db: Session, sender: str, code: str) -> bool:
    candidate = (
        db.query(User)
        .filter(User.whatsapp_link_code == code, User.whatsapp_link_code_expires > datetime.utcnow())
        .first()
    )
    if candidate is None:
        return False

    existing = db.query(User).filter(User.whatsapp_number == sender).first()
    if existing is not None and existing.id != candidate.id:
        existing.whatsapp_number = None  # a number can only ever link to one account

    candidate.whatsapp_number = sender
    candidate.whatsapp_link_code = None
    candidate.whatsapp_link_code_expires = None
    db.commit()

    send_text(sender, WELCOME_COPY)
    return True
