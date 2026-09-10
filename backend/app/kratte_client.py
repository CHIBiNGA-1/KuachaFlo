import logging

import httpx

from app.config import settings


class KratteImportFailed(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def import_sales_sheet(whatsapp_number: str, items: list[dict]) -> dict:
    """
    Hands extracted sales-sheet line items to KraTte's own backend, which
    runs them through its real business logic (stock decrement, order
    referencing, versioning) rather than this service writing into
    KraTte's tables directly and risking violating invariants it enforces
    in its own code.

    Raises KratteImportFailed with a message suitable for a WhatsApp
    reply on any failure — not linked, nothing matched, KraTte
    unreachable, etc.
    """
    if not settings.kratte_internal_api_key:
        raise KratteImportFailed("KraTte integration isn't configured yet.")

    try:
        response = httpx.post(
            f"{settings.kratte_api_url}/api/internal/whatsapp-import",
            json={"whatsappNumber": whatsapp_number, "items": items},
            headers={"x-internal-key": settings.kratte_internal_api_key},
            timeout=30.0,
        )
    except httpx.RequestError as e:
        logging.error(f"KraTte import request failed: {e}")
        raise KratteImportFailed("Couldn't reach KraTte right now — try again shortly.")

    if response.status_code >= 400:
        try:
            detail = response.json().get("error", "That sale couldn't be recorded.")
        except ValueError:
            detail = "That sale couldn't be recorded."
        logging.error(f"KraTte import rejected: {response.status_code} {detail}")
        raise KratteImportFailed(detail)

    return response.json()
