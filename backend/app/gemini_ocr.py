"""
Receipt OCR + auto-categorization via Gemini's API.

This replaces the local Tesseract engine entirely — one multimodal call
extracts the merchant/date/total AND classifies the receipt into one of
your existing categories, using a JSON schema `enum` so Gemini is
constrained to your real category list and can't invent new ones.

Runs server-side only. The API key never reaches the browser.
"""

import base64
import json
import logging

from datetime import datetime

import httpx

from app.config import settings

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

REQUEST_TIMEOUT_SECONDS = 30.0

EXTRACTION_PROMPT = (
    "You are a receipt-parsing engine. Look at this receipt photo and extract:\n"
    "- storeName: the merchant/business name\n"
    "- date: the purchase date in YYYY-MM-DD format\n"
    "- totalAmount: the final amount paid (a number, no currency symbol)\n"
    "- currency: a 3-letter currency code, inferred from symbols ($, €, £), "
    "abbreviations (KSH, KES, ZMW), or context\n"
    "- category: classify the receipt into exactly ONE of the allowed categories "
    "based on the store name and items purchased\n\n"
    "If a field genuinely can't be determined from the image, omit it rather than "
    "guessing. Do not invent numbers or names that aren't visible in the photo."
)


class GeminiNotConfigured(RuntimeError):
    """Raised when GEMINI_API_KEY is missing so callers can give a clear error."""


def _build_schema(category_names: list[str]) -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "storeName": {"type": "STRING"},
            "date": {"type": "STRING", "description": "Purchase date, YYYY-MM-DD"},
            "totalAmount": {"type": "NUMBER"},
            "currency": {"type": "STRING", "description": "3-letter currency code"},
            "category": {"type": "STRING", "enum": category_names},
        },
        "required": ["storeName", "totalAmount", "category"],
    }


def extract_receipt_data(image_bytes: bytes, category_names: list[str]) -> dict:
    """
    Sends the receipt image to Gemini for OCR + categorization in a single
    call. Returns a dict shaped for the Receipt model, plus a
    `category_name` key the caller matches back to a Category row.

    Never raises for "Gemini couldn't read this receipt" — that comes back
    as a low-confidence / needs_review result so a bad photo doesn't 500 the
    whole upload. It DOES raise GeminiNotConfigured if there's no API key,
    since that's a setup problem, not a bad-photo problem.
    """
    if not settings.gemini_api_key:
        raise GeminiNotConfigured(
            "GEMINI_API_KEY is not set. Get a free key (no card) at "
            "https://aistudio.google.com/apikey and add it to your environment "
            "— see README for where."
        )

    payload = {
        "contents": [{
            "parts": [
                {"text": EXTRACTION_PROMPT},
                {
                    "inlineData": {
                        "mimeType": "image/jpeg",
                        "data": base64.b64encode(image_bytes).decode("utf-8"),
                    }
                },
            ]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _build_schema(category_names),
        },
    }

    url = GEMINI_ENDPOINT.format(model=settings.gemini_model)

    try:
        response = httpx.post(
            url,
            headers={
                "x-goog-api-key": settings.gemini_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        logging.error(f"Gemini API error {e.response.status_code}: {e.response.text}")
        return _needs_review(f"Gemini API error {e.response.status_code} — check your API key/quota")
    except httpx.RequestError as e:
        logging.error(f"Gemini API request failed: {e}")
        return _needs_review("Could not reach Gemini's API — check your connection")

    data = response.json()

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logging.error(f"Could not parse Gemini response: {e} — raw: {data}")
        return _needs_review("Gemini returned something we couldn't parse")

    merchant = parsed.get("storeName")
    total = parsed.get("totalAmount")
    category_name = parsed.get("category")
    currency = parsed.get("currency") or "USD"

    purchase_date = None
    if parsed.get("date"):
        try:
            purchase_date = datetime.strptime(parsed["date"], "%Y-%m-%d").date()
        except ValueError:
            pass  # leave it null rather than guess

    if merchant and total and purchase_date and category_name:
        confidence = "high"
    elif merchant and total:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "merchant": merchant,
        "total_amount": total,
        "tax_amount": None,
        "purchase_date": purchase_date,
        "currency": currency,
        "raw_ocr_text": json.dumps(parsed),
        "confidence": confidence,
        "status": "processed" if (merchant or total) else "needs_review",
        "category_name": category_name,
    }


def _needs_review(reason: str) -> dict:
    """Used when Gemini itself is unreachable/misconfigured — surfaces the
    reason in raw_ocr_text so it shows up if you go digging, without
    crashing the upload."""
    return {
        "merchant": None,
        "total_amount": None,
        "tax_amount": None,
        "purchase_date": None,
        "currency": "USD",
        "raw_ocr_text": reason,
        "confidence": "low",
        "status": "needs_review",
        "category_name": None,
    }


MOMO_EXTRACTION_PROMPT = (
    "You will be shown a WhatsApp message someone forwarded. Decide: is this "
    "an actual mobile money or bank transaction alert (e.g. Airtel Money, "
    "MTN MoMo, Zamtel Kwacha, or a bank SMS confirming a payment, transfer, "
    "withdrawal, or deposit)? People forward all sorts of things, so most "
    "messages will NOT be this.\n\n"
    "If it genuinely is a transaction alert, set isTransaction to true and extract:\n"
    "- counterparty: who the money went to or came from (business or person name)\n"
    "- amount: the transaction amount (a number, no currency symbol/commas)\n"
    "- direction: one of sent, received, payment, withdrawal, deposit, airtime, unknown\n"
    "- currency: 3-letter code (ZMW, USD, etc.) if determinable, else ZMW\n"
    "- category: best-fit category for this spend, from the allowed list — only "
    "for direction=sent/payment/withdrawal/airtime; omit for received/deposit\n"
    "- reference: the transaction reference/ID if one is present\n\n"
    "If this is NOT a transaction alert (it's chat, a question, a joke, an "
    "unrelated forward, etc.), set isTransaction to false and leave every "
    "other field out. Never guess numbers or names that aren't in the text."
)


def _build_momo_schema(category_names: list[str]) -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "isTransaction": {"type": "BOOLEAN"},
            "counterparty": {"type": "STRING"},
            "amount": {"type": "NUMBER"},
            "direction": {
                "type": "STRING",
                "enum": ["sent", "received", "payment", "withdrawal", "deposit", "airtime", "unknown"],
            },
            "currency": {"type": "STRING"},
            "category": {"type": "STRING", "enum": category_names},
            "reference": {"type": "STRING"},
        },
        "required": ["isTransaction"],
    }


def extract_transaction_from_text(text: str, category_names: list[str]) -> dict | None:
    """
    Classifies + extracts a forwarded WhatsApp text as a mobile money/bank
    transaction, or returns None if it isn't one (so the caller can fall
    back to a normal chat reply instead of forcing every text into a
    ledger entry). Raises GeminiNotConfigured under the same condition as
    extract_receipt_data — this is a genuine setup problem, not a "this
    text isn't a transaction" case.
    """
    if not settings.gemini_api_key:
        raise GeminiNotConfigured("GEMINI_API_KEY is not set.")

    payload = {
        "contents": [{"parts": [{"text": f"{MOMO_EXTRACTION_PROMPT}\n\nMessage:\n{text}"}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _build_momo_schema(category_names),
        },
    }

    url = GEMINI_ENDPOINT.format(model=settings.gemini_model)

    try:
        response = httpx.post(
            url,
            headers={"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        logging.error(f"Gemini MoMo-text extraction failed: {e}")
        return None  # treat "Gemini unreachable" as "not a transaction" here — a
        # WhatsApp reply saying "OCR is down" for a message that was never
        # meant to be a receipt in the first place would be confusing, not helpful

    try:
        text_out = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text_out)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logging.error(f"Could not parse Gemini MoMo-text response: {e}")
        return None

    if not parsed.get("isTransaction") or not parsed.get("amount"):
        return None

    direction = parsed.get("direction", "unknown")
    is_spend = direction in ("sent", "payment", "withdrawal", "airtime")

    return {
        "merchant": parsed.get("counterparty") or direction.capitalize(),
        "total_amount": parsed["amount"],
        "tax_amount": None,
        "purchase_date": datetime.utcnow().date(),  # SMS text rarely has a
        # reliable full date in it — logging "today" beats guessing wrong
        "currency": parsed.get("currency") or "ZMW",
        "raw_ocr_text": json.dumps(parsed),
        "confidence": "medium",
        "status": "processed",
        "category_name": parsed.get("category") if is_spend else None,
        "direction": direction,
    }


# Fixed category list for KraTte's inventory (see kratte/src/lib/types.ts) —
# Gemini's guess must be one of these exactly, or product auto-creation
# there would reject it.
KRATTE_CATEGORIES = [
    "Beverages", "Pantry", "Fresh & dairy", "Snacks",
    "Personal care", "Household", "Other",
]

SALES_SHEET_PROMPT = (
    "You are looking at a photo of a shop's sales record for the day — a "
    "handwritten tally sheet, a till receipt roll, or a notebook page "
    "listing what was sold. Extract every distinct line item you can "
    "read as an entry with:\n"
    "- name: the product name, as written (don't invent a fuller/different name)\n"
    "- quantity: how many units were sold (a whole number; if not stated, use 1)\n"
    "- unitPrice: the price per unit sold, as a number with no currency symbol\n"
    "- categoryGuess: your best-fit category for this product, from the allowed list\n\n"
    "Skip anything you can't confidently read rather than guessing. If the "
    "photo isn't a sales/tally sheet at all, return an empty items list."
)


def _build_sales_sheet_schema() -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "items": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "quantity": {"type": "NUMBER"},
                        "unitPrice": {"type": "NUMBER"},
                        "categoryGuess": {"type": "STRING", "enum": KRATTE_CATEGORIES},
                    },
                    "required": ["name", "quantity", "unitPrice"],
                },
            },
        },
        "required": ["items"],
    }


def extract_sales_sheet(image_bytes: bytes) -> list[dict]:
    """
    Reads a photo of a day's sales sheet/till tally and returns a list of
    {name, quantity, unitPrice, categoryGuess} line items — the shape
    KraTte's /api/internal/whatsapp-import endpoint expects directly.
    Returns an empty list on any failure (unreadable photo, Gemini down,
    not actually a sales sheet) rather than raising — callers should
    treat an empty list as "couldn't find anything to log", not a crash.
    """
    if not settings.gemini_api_key:
        raise GeminiNotConfigured("GEMINI_API_KEY is not set.")

    payload = {
        "contents": [{
            "parts": [
                {"text": SALES_SHEET_PROMPT},
                {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(image_bytes).decode("utf-8")}},
            ]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _build_sales_sheet_schema(),
        },
    }

    url = GEMINI_ENDPOINT.format(model=settings.gemini_model)

    try:
        response = httpx.post(
            url,
            headers={"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        logging.error(f"Gemini sales-sheet extraction failed: {e}")
        return []

    try:
        text_out = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text_out)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logging.error(f"Could not parse Gemini sales-sheet response: {e}")
        return []

    items = parsed.get("items") or []
    return [item for item in items if item.get("name") and item.get("unitPrice") is not None]
