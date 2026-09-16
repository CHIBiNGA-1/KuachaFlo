"""Meta WhatsApp Cloud API plumbing: verifying inbound webhook signatures,
downloading media a user sent, and sending text replies back.

Synchronous on purpose - the rest of the request path (SQLAlchemy,
shop_capture, classify) is sync too, so the webhook handler can call
these directly without an event-loop dance. With WHATSAPP_* unset in
config, routers/whatsapp.py never calls these - the app works fine
without a WhatsApp Business number.
"""

import hashlib
import hmac
import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.facebook.com/v21.0"


def verify_signature(payload: bytes, signature_header: str | None) -> bool:
    """Checks the X-Hub-Signature-256 header Meta sends on every webhook
    POST. Without WHATSAPP_APP_SECRET configured, verification is skipped
    (useful for local testing) - never skip this in a real deployment."""
    if not settings.whatsapp_app_secret:
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.whatsapp_app_secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    given = signature_header.split("=", 1)[1]
    return hmac.compare_digest(expected, given)


def download_media(media_id: str) -> tuple[bytes, str] | None:
    """Two Graph API calls: resolve the media_id to a short-lived URL,
    then fetch the bytes. Returns (content, mime_type) or None on failure."""
    if not settings.whatsapp_access_token:
        return None
    headers = {"Authorization": f"Bearer {settings.whatsapp_access_token}"}
    try:
        with httpx.Client(timeout=20) as client:
            meta = client.get(f"{GRAPH_BASE}/{media_id}", headers=headers)
            meta.raise_for_status()
            url = meta.json()["url"]
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
            mime = resp.headers.get("content-type", "image/jpeg")
            return resp.content, mime
    except httpx.HTTPError as exc:
        log.warning("whatsapp media download failed for %s: %s", media_id, exc)
        return None


def send_text(to: str, body: str) -> bool:
    """Sends a plain text reply. `to` is the sender's WhatsApp number as
    Meta reports it (already in international format, no leading '+')."""
    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        return False
    url = f"{GRAPH_BASE}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.whatsapp_access_token}"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": body[:4096]},
    }
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            return True
    except httpx.HTTPError as exc:
        log.warning("whatsapp send_text failed for %s: %s", to, exc)
        return False
