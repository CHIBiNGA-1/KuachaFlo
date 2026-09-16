"""Best-effort pings to the operator's Telegram."""

import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)


def notify_admin(text: str) -> None:
    """Best-effort ping to the operator's Telegram when something needs
    manual review (a new MoMo payment claim). Never raises — a failed
    notification shouldn't fail the request that triggered it; the item
    still shows up in the admin API either way."""
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        httpx.post(
            url,
            json={"chat_id": settings.telegram_chat_id, "text": text},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        log.warning("telegram notify_admin failed: %s", exc)
