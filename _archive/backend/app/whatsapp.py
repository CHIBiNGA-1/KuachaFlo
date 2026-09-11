import hashlib
import hmac
import logging

import httpx

from app.config import settings

GRAPH_BASE = "https://graph.facebook.com/v21.0"


def verify_signature(payload_bytes: bytes, signature_header: str | None) -> bool:
    """
    Confirms a webhook POST genuinely came from Meta, not a spoofed
    request hitting this public endpoint. Meta signs the raw body with
    the app secret and sends it as 'sha256=<hex>' in X-Hub-Signature-256.
    """
    if not signature_header or not settings.whatsapp_app_secret:
        return False
    if not signature_header.startswith("sha256="):
        return False

    expected = hmac.new(
        settings.whatsapp_app_secret.encode(), payload_bytes, hashlib.sha256
    ).hexdigest()
    provided = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, provided)


def send_text(to: str, body: str) -> None:
    """Best-effort reply — never raises, so a failed reply doesn't turn a
    successfully-logged receipt into a 500 for the webhook caller."""
    try:
        httpx.post(
            f"{GRAPH_BASE}/{settings.whatsapp_phone_number_id}/messages",
            headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
            json={
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"body": body},
            },
            timeout=15.0,
        )
    except Exception:
        logging.exception("WhatsApp send_text failed")


def download_media(media_id: str) -> bytes | None:
    """Two-step fetch per the Cloud API: resolve media_id -> a short-lived
    URL, then download from that URL with the same access token."""
    try:
        meta_resp = httpx.get(
            f"{GRAPH_BASE}/{media_id}",
            headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
            timeout=15.0,
        )
        meta_resp.raise_for_status()
        media_url = meta_resp.json()["url"]

        file_resp = httpx.get(
            media_url,
            headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
            timeout=30.0,
        )
        file_resp.raise_for_status()
        return file_resp.content
    except Exception:
        logging.exception("WhatsApp download_media failed for media_id=%s", media_id)
        return None
