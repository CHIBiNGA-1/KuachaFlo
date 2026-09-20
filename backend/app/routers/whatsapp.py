"""WhatsApp capture: link a number once, then text or photo it straight
into the shop.

Content decides what a message is (a day-sales tally, a till-roll photo,
supplier paperwork, chit-chat); shop_capture.py decides what to do with
it. No drafts, no open questions carried between messages — a sheet we
can't read is a "send it again", not a stored question.
"""

import hashlib
import io
import logging
import random
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from PIL import Image
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.classify import GeminiNotConfigured
from app.config import settings
from app.db import get_db
from app.deps import LimitReached
from app.deps import get_current_user
from app.limiter import limiter
from app.models import Business, Profile, WhatsAppProcessedMessage
from app.shop_ask import low_stock_nudge, try_answer
from app.shop_capture import receive_sheet_photo, receive_sheet_text
from app.whatsapp import download_media, send_text, verify_signature

log = logging.getLogger(__name__)

router = APIRouter(tags=["whatsapp"])

LINK_CODE_TTL_MINUTES = 15

# Brute-force guard on the 6-digit link code: 1,000,000 possible codes and
# a 15-minute TTL is fine against a slow, honest retry — not against a
# script hammering guesses at a known number. Locks that sender out of
# further attempts for a cooldown window after too many wrong guesses.
# Process-local (fine for the single instance this runs on; a multi-
# instance deployment would want this in the database instead).
LINK_MAX_ATTEMPTS = 5
LINK_LOCKOUT_MINUTES = 15
_link_failures: dict[str, list[datetime]] = {}


def _link_attempts_locked(sender: str) -> bool:
    cutoff = datetime.utcnow() - timedelta(minutes=LINK_LOCKOUT_MINUTES)
    recent = [t for t in _link_failures.get(sender, []) if t > cutoff]
    _link_failures[sender] = recent
    return len(recent) >= LINK_MAX_ATTEMPTS


def _record_link_failure(sender: str) -> None:
    _link_failures.setdefault(sender, []).append(datetime.utcnow())

LINK_COPY = (
    "To link this number, open KraTte → Settings → WhatsApp, "
    "grab your 6-digit code, and send it here."
)
WELCOME_COPY = (
    "Linked! Send a day-sales tally or a till-roll photo — "
    "I'll ring it up into your Sales."
)
FALLBACK_COPY = (
    "Send a day-sales tally or a till-roll photo — that's what I'm best at."
)
LIMIT_COPY = (
    "That looks like a sale, but you're at the {limit}-entry limit on the "
    "{plan} plan. Upgrade in the app to keep going."
)
UNAVAILABLE_COPY = "Scanning is temporarily unavailable — try again shortly."
CODE_WRONG_COPY = (
    "That code's wrong or expired — grab a fresh one from "
    "Settings → WhatsApp in the app."
)
LINK_LOCKED_COPY = (
    "Too many wrong codes from this number — try again in a few minutes, "
    "or grab a fresh code from Settings → WhatsApp in the app."
)


class WhatsAppLinkCodeOut(BaseModel):
    code: str
    expires_in_minutes: int
    whatsapp_number: str
    already_linked: bool


# ── Account linking (called from the app) ──────────────────────────────

@router.post("/api/v1/account/whatsapp/link-code")
@limiter.limit("10/hour")
def generate_link_code(
    request: Request,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(Profile, user["id"])
    if profile is None:
        profile = Profile(id=user["id"], plan="free")
        db.add(profile)
    code = "".join(random.choices(string.digits, k=6))
    profile.whatsapp_link_code = code
    profile.whatsapp_link_code_expires = datetime.utcnow() + timedelta(
        minutes=LINK_CODE_TTL_MINUTES
    )
    db.commit()
    return {
        "code": code,
        "expires_in_minutes": LINK_CODE_TTL_MINUTES,
        "whatsapp_number": settings.whatsapp_display_number,
        "already_linked": bool(profile.whatsapp_number),
    }


@router.delete("/api/v1/account/whatsapp/link", status_code=204)
def unlink_whatsapp(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.get(Profile, user["id"])
    if profile is not None:
        profile.whatsapp_number = None
        profile.whatsapp_link_code = None
        profile.whatsapp_link_code_expires = None
        db.commit()
    return None


# ── Meta webhook ─────────────────────────────────────────────────────────

@router.get("/api/v1/whatsapp/webhook")
def verify_webhook(
    hub_mode: str = Query(alias="hub.mode", default=""),
    hub_verify_token: str = Query(alias="hub.verify_token", default=""),
    hub_challenge: str = Query(alias="hub.challenge", default=""),
):
    """Meta hits this once, at setup time, to prove you own the endpoint."""
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(403, "Verification failed")


@router.post("/api/v1/whatsapp/webhook")
async def receive_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    if not verify_signature(body, request.headers.get("x-hub-signature-256")):
        raise HTTPException(401, "Bad signature")

    payload = await request.json()
    try:
        entry = (payload.get("entry") or [{}])[0]
        change = (entry.get("changes") or [{}])[0]
        value = change.get("value", {})
        messages = value.get("messages", [])
    except (IndexError, AttributeError):
        return {"status": "ok"}

    for message in messages:
        message_id = message.get("id")
        sender = message.get("from")
        if not message_id or not sender:
            continue

        # Meta retries a webhook delivery if it doesn't get a fast 200 — a
        # slow Gemini call is enough to trigger a retry, which would
        # otherwise ring up the same sale twice. Claim the message_id
        # BEFORE any processing starts, so an overlapping retry is
        # blocked immediately rather than racing the first attempt.
        try:
            db.add(WhatsAppProcessedMessage(message_id=message_id))
            db.commit()
        except IntegrityError:
            db.rollback()
            continue

        try:
            _handle_message(db, sender, message)
        except Exception:
            log.exception("whatsapp message handling failed for %s", message_id)

    return {"status": "ok"}


# ── Message handling ──────────────────────────────────────────────────────

def _shop_confirm(sale: dict) -> str:
    n = sale["items"]
    line = (
        f"Rung up {sale['reference']}: K {sale['total']:,.2f} "
        f"({n} {('item' if n == 1 else 'items')}). In Sales now."
    )
    if sale["created"]:
        line += f" New on the shelf: {', '.join(sale['created'])} — check their cost prices."
    return line


def _shop_expense_line(expense: dict) -> str:
    return (
        f"Filed as an unpaid expense: {expense['name']} — K {expense['amount']:,.2f}. "
        "Flip it to Paid in Expenses when you settle."
    )


def _handle_shop_result(db: Session, sender: str, res: dict) -> None:
    if res["status"] == "filed":
        sale = res["sale"]
        message = _shop_confirm(sale)
        # A sale that empties a shelf is worth knowing about now, while the
        # owner is still standing at it — not the next time they open the app.
        business = db.get(Business, sale.get("business_id")) if sale.get("business_id") else None
        if business is not None:
            nudge = low_stock_nudge(db, business, sale.get("product_ids") or [])
            if nudge:
                message = f"{message}\n\n{nudge}"
        send_text(sender, message)
    elif res["status"] == "filed_expense":
        send_text(sender, _shop_expense_line(res["expense"]))
    else:
        send_text(sender, res.get("message") or FALLBACK_COPY)


def _handle_message(db: Session, sender: str, message: dict) -> None:
    msg_type = message.get("type")
    text_body = (message.get("text") or {}).get("body", "") if msg_type == "text" else ""

    # --- linking: a 6-digit code as plain text (linked or not) ---
    if msg_type == "text" and text_body.strip().isdigit() and len(text_body.strip()) == 6:
        if _link_attempts_locked(sender):
            send_text(sender, LINK_LOCKED_COPY)
        elif not _try_link(db, sender, text_body.strip()):
            _record_link_failure(sender)
            send_text(sender, CODE_WRONG_COPY)
        return

    profile = db.query(Profile).filter(Profile.whatsapp_number == sender).first()
    if profile is None:
        if msg_type == "image":
            send_text(sender, f"{LINK_COPY} Then send the photo again.")
        else:
            send_text(sender, LINK_COPY)
        return

    plan = profile.plan or "free"

    if msg_type == "text":
        if not text_body.strip():
            return

        # Questions are answered straight from the shop's own rows, before
        # anything reaches the classifier: "low" is a question about the
        # shelf, not a one-line sales tally, and must never be rung up as
        # one. Anything not in the fixed vocabulary returns None and falls
        # through to capture untouched.
        business = db.query(Business).filter(Business.owner_user_id == profile.id).first()
        if business is not None:
            answer = try_answer(db, business, text_body)
            if answer is not None:
                send_text(sender, answer)
                return

        try:
            res = receive_sheet_text(db, profile, text_body.strip())
        except LimitReached as e:
            send_text(sender, LIMIT_COPY.format(limit=e.limit, plan=plan))
            return
        except GeminiNotConfigured:
            send_text(sender, UNAVAILABLE_COPY)
            return
        _handle_shop_result(db, sender, res)

    elif msg_type == "image":
        media_id = (message.get("image") or {}).get("id")
        media = download_media(media_id) if media_id else None
        if media is None:
            send_text(sender, "Couldn't download that image — try sending it again.")
            return
        image_bytes, _mime = media
        if len(image_bytes) > settings.max_upload_mb * 1024 * 1024:
            send_text(
                sender,
                f"That image is too large ({settings.max_upload_mb}MB max) — "
                "try a lower-res photo.",
            )
            return
        try:
            Image.open(io.BytesIO(image_bytes)).verify()
        except Exception:
            send_text(sender, "Couldn't read that as an image — send it as a photo, not a document.")
            return
        try:
            res = receive_sheet_photo(db, profile, image_bytes)
        except LimitReached as e:
            send_text(sender, LIMIT_COPY.format(limit=e.limit, plan=plan))
            return
        except GeminiNotConfigured:
            send_text(sender, UNAVAILABLE_COPY)
            return
        _handle_shop_result(db, sender, res)

    else:
        send_text(sender, FALLBACK_COPY)


def _try_link(db: Session, sender: str, code: str) -> bool:
    candidate = (
        db.query(Profile)
        .filter(
            Profile.whatsapp_link_code == code,
            Profile.whatsapp_link_code_expires > datetime.utcnow(),
        )
        .first()
    )
    if candidate is None:
        return False

    existing = db.query(Profile).filter(Profile.whatsapp_number == sender).first()
    if existing is not None and existing.id != candidate.id:
        existing.whatsapp_number = None  # a number can only ever link to one account

    candidate.whatsapp_number = sender
    candidate.whatsapp_link_code = None
    candidate.whatsapp_link_code_expires = None
    db.commit()

    _link_failures.pop(sender, None)
    send_text(sender, WELCOME_COPY)
    return True
