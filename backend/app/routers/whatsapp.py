import logging
import random
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import WhatsAppLinkCodeOut
from app.receipt_service import process_receipt_image, ReceiptLimitReached, ReceiptTooLarge, ReceiptUnreadable, ReceiptOcrUnavailable
from app.whatsapp import verify_signature, send_text, download_media

router = APIRouter(tags=["whatsapp"])

LINK_CODE_TTL_MINUTES = 15


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
    except (KeyError, IndexError):
        logging.warning("Unrecognised WhatsApp webhook payload shape")
        return {"status": "ignored"}

    _handle_message(db, sender, message)
    return {"status": "ok"}


def _handle_message(db: Session, sender: str, message: dict) -> None:
    msg_type = message.get("type")
    user = db.query(User).filter(User.whatsapp_number == sender).first()

    # --- linking flow: a 6-digit code sent as plain text ---
    if msg_type == "text":
        text = message["text"]["body"].strip()
        if text.isdigit() and len(text) == 6:
            _try_link(db, sender, text)
            return
        send_text(
            sender,
            "👋 Send a photo of a receipt and I'll log it in KuachaFlo."
            if user else
            "👋 To link this number, open KuachaFlo → Account → WhatsApp, "
            "grab your 6-digit code, and send it here.",
        )
        return

    # --- receipt capture: an image, from an already-linked number ---
    if msg_type == "image":
        if user is None:
            send_text(
                sender,
                "This number isn't linked to a KuachaFlo account yet. Open the app → "
                "Account → WhatsApp to get a code, then send it here first.",
            )
            return

        image_bytes = download_media(message["image"]["id"])
        if image_bytes is None:
            send_text(sender, "⚠️ Couldn't download that image — try sending it again.")
            return

        try:
            result = process_receipt_image(db, user, image_bytes)
        except ReceiptLimitReached as e:
            send_text(
                sender,
                f"You've hit the {e.limit}-receipt limit on the {e.plan} plan. "
                f"Upgrade in the app to keep logging receipts here.",
            )
            return
        except ReceiptTooLarge:
            send_text(sender, "That image is too large (10MB max) — try a lower-res photo.")
            return
        except ReceiptUnreadable:
            send_text(sender, "⚠️ Couldn't read that as an image — try sending it as a photo, not a document.")
            return
        except ReceiptOcrUnavailable:
            send_text(sender, "⚠️ Receipt scanning is temporarily unavailable — try again shortly.")
            return

        r = result.receipt
        amount = f"{r.currency or ''} {r.total_amount:,.2f}".strip() if r.total_amount else "amount unclear"
        cat = result.matched_category_name or "uncategorised"
        merchant = r.merchant or "receipt"
        send_text(sender, f"✅ Logged: {merchant} — {amount} ({cat})\nView it anytime in KuachaFlo.")
        return

    # --- anything else (audio, documents, stickers…) ---
    if user is not None:
        send_text(sender, "Send a photo of a receipt and I'll log it — that's what I'm best at for now.")


def _try_link(db: Session, sender: str, code: str) -> None:
    candidate = (
        db.query(User)
        .filter(User.whatsapp_link_code == code, User.whatsapp_link_code_expires > datetime.utcnow())
        .first()
    )
    if candidate is None:
        send_text(sender, "That code's wrong or expired — grab a fresh one from KuachaFlo → Account → WhatsApp.")
        return

    existing = db.query(User).filter(User.whatsapp_number == sender).first()
    if existing is not None and existing.id != candidate.id:
        existing.whatsapp_number = None  # a number can only ever link to one account

    candidate.whatsapp_number = sender
    candidate.whatsapp_link_code = None
    candidate.whatsapp_link_code_expires = None
    db.commit()

    send_text(sender, "✅ Linked! Send a photo of any receipt and I'll log it in KuachaFlo.")
