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
