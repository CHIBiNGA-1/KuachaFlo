import logging

import httpx

from app.config import settings


def notify_admin(text: str) -> None:
    """
    Best-effort ping to the operator's Telegram when something needs
    manual review (a new MoMo payment claim). Never raises — a failed
    notification shouldn't fail the request that triggered it; the item
    still shows up in the admin dashboard either way.
    """
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return

    try:
        httpx.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            json={
                "chat_id": settings.telegram_chat_id,
                "text": text,
                "parse_mode": "Markdown",
            },
            timeout=10.0,
        )
    except Exception:
        logging.exception("Telegram notification failed")
