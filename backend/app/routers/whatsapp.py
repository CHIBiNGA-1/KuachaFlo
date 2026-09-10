import logging
import random
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User, WhatsAppProcessedMessage
from app.schemas import WhatsAppLinkCodeOut
from app.receipt_service import (
    process_receipt_image, process_momo_text,
    ReceiptLimitReached, ReceiptTooLarge, ReceiptUnreadable, ReceiptOcrUnavailable,
)
from app.whatsapp import verify_signature, send_text, download_media
from app.gemini_ocr import extract_sales_sheet, GeminiNotConfigured
from app.kratte_client import import_sales_sheet, KratteImportFailed

router = APIRouter(tags=["whatsapp"])

LINK_CODE_TTL_MINUTES = 15


# ── KraTte lookups ───────────────────────────────────────────────────────
# KraTte's shop_users table lives in this same Postgres database but isn't
# a SQLAlchemy model here — it's a separate app's schema, deliberately
# queried with raw SQL rather than pulling its ORM models into this
# codebase, since these two apps otherwise share nothing.

def _find_kratte_account(db: Session, sender: str) -> str | None:
    try:
        row = db.execute(
            text("SELECT id FROM shop_users WHERE whatsapp_number = :sender"),
            {"sender": sender},
        ).first()
        return str(row[0]) if row else None
    except Exception:
        # KraTte's table being briefly unreachable/misconfigured must never
        # take down KuachaFlo's own core WhatsApp flow.
        db.rollback()
        logging.exception("KraTte account lookup failed")
        return None


def _try_link_kratte(db: Session, sender: str, code: str) -> bool:
    try:
        candidate = db.execute(
            text(
                "SELECT id FROM shop_users "
                "WHERE whatsapp_link_code = :code AND whatsapp_link_code_expires > now()"
            ),
            {"code": code},
        ).first()
        if candidate is None:
            return False

        db.execute(
            text("UPDATE shop_users SET whatsapp_number = NULL WHERE whatsapp_number = :sender AND id != :id"),
            {"sender": sender, "id": candidate[0]},
        )
        db.execute(
            text(
                "UPDATE shop_users SET whatsapp_number = :sender, whatsapp_link_code = NULL, "
                "whatsapp_link_code_expires = NULL WHERE id = :id"
            ),
            {"sender": sender, "id": candidate[0]},
        )
        db.commit()
    except Exception:
        db.rollback()
        logging.exception("KraTte link attempt failed")
        return False

    send_text(sender, "✅ Linked! Send a photo of your day's sales sheet and I'll log each item in KraTte.")
    return True


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
    # the same receipt 2-3 times. Claim the message_id BEFORE any
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


def _handle_message(db: Session, sender: str, message: dict) -> None:
    msg_type = message.get("type")
    user = db.query(User).filter(User.whatsapp_number == sender).first()
    kratte_account_id = None if user else _find_kratte_account(db, sender)

    # --- linking flow: a 6-digit code sent as plain text ---
    if msg_type == "text":
        text_body = message["text"]["body"].strip()
        if text_body.isdigit() and len(text_body) == 6:
            if not _try_link(db, sender, text_body) and not _try_link_kratte(db, sender, text_body):
                send_text(
                    sender,
                    "That code's wrong or expired — grab a fresh one from "
                    "KuachaFlo → Account → WhatsApp, or KraTte → Settings → WhatsApp.",
                )
            return

        # --- forwarded MoMo/bank SMS: try to recognise it as a transaction
        # before falling back to a generic reply. Most texts won't be one
        # (chit-chat, questions) — that's expected, not an error.
        if user is not None:
            try:
                result = process_momo_text(db, user, text_body)
            except ReceiptLimitReached as e:
                send_text(
                    sender,
                    f"That looks like a MoMo transaction, but you're at the "
                    f"{e.limit}-receipt limit on the {e.plan} plan. Upgrade in the app to keep logging.",
                )
                return
            except ReceiptOcrUnavailable:
                result = None  # stay quiet rather than error on a message that might not even be a transaction

            if result is not None:
                r = result.receipt
                amount = f"{r.currency or ''} {r.total_amount:,.2f}".strip() if r.total_amount else "amount unclear"
                cat = result.matched_category_name or "uncategorised"
                who = r.merchant or "transaction"
                send_text(sender, f"✅ Logged: {who} — {amount} ({cat})\nView it anytime in KuachaFlo.")
                return

        if kratte_account_id:
            send_text(sender, "Send a photo of your day's sales sheet and I'll log each item in KraTte.")
            return

        send_text(
            sender,
            "👋 Send a photo of a receipt, or forward a MoMo/bank transaction alert, and I'll log it in KuachaFlo."
            if user else
            "👋 To link this number, open KuachaFlo → Account → WhatsApp (or KraTte → Settings → WhatsApp), "
            "grab your 6-digit code, and send it here.",
        )
        return

    # --- a photo: receipt capture (KuachaFlo) or sales-sheet capture (KraTte) ---
    if msg_type == "image":
        if user is None and kratte_account_id is None:
            send_text(
                sender,
                "This number isn't linked to a KuachaFlo or KraTte account yet. "
                "Open either app → Account/Settings → WhatsApp to get a code, then send it here first.",
            )
            return

        image_bytes = download_media(message["image"]["id"])
        if image_bytes is None:
            send_text(sender, "⚠️ Couldn't download that image — try sending it again.")
            return

        if kratte_account_id:
            _handle_kratte_sales_photo(sender, kratte_account_id, image_bytes)
            return

        try:
            result = process_receipt_image(db, user, image_bytes, source="whatsapp_photo")
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
    elif kratte_account_id:
        send_text(sender, "Send a photo of your day's sales sheet and I'll log each item — that's what I'm best at for now.")


def _handle_kratte_sales_photo(sender: str, kratte_account_id: str, image_bytes: bytes) -> None:
    try:
        items = extract_sales_sheet(image_bytes)
    except GeminiNotConfigured:
        send_text(sender, "⚠️ Sales-sheet scanning is temporarily unavailable — try again shortly.")
        return

    if not items:
        send_text(sender, "I couldn't make out any items on that sheet — try a clearer or better-lit photo.")
        return

    try:
        result = import_sales_sheet(sender, items)
    except KratteImportFailed as e:
        send_text(sender, f"⚠️ {e.message}")
        return

    lines = [f"✅ Logged {result['itemCount']} item(s) as {result.get('saleName', 'a sale')}."]
    if result.get("amount"):
        lines.append(f"Total: {result['amount']:,.2f}")
    if result.get("newProducts"):
        names = ", ".join(result["newProducts"])
        lines.append(f"New products added — check their cost price in KraTte: {names}")
    send_text(sender, "\n".join(lines))


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

    send_text(sender, "✅ Linked! Send a photo of any receipt and I'll log it in KuachaFlo.")
    return True
