import base64
import json
import logging
from datetime import date

import httpx

from app.config import settings

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
REQUEST_TIMEOUT_SECONDS = 30.0

CATEGORIES = [
    "Fuel & Transport", "Meals & Food", "Supplies", "Equipment",
    "Accessories", "Software & Subs", "Other",
]

EXTRACTION_PROMPT = (
    "Extract the following from this receipt photo: merchant name, total "
    "amount, currency (3-letter code, default ZMW if unclear), purchase "
    "date (YYYY-MM-DD, use today if unreadable), and the best-fit category "
    "from this exact list: " + ", ".join(CATEGORIES) + ". "
    "If you cannot read the total amount at all, set merchant to null."
)

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "merchant": {"type": "STRING"},
        "amount": {"type": "NUMBER"},
        "currency": {"type": "STRING"},
        "date": {"type": "STRING"},
        "category": {"type": "STRING", "enum": CATEGORIES},
    },
    "required": ["amount"],
}


class GeminiNotConfigured(Exception):
    pass


def extract_receipt(image_bytes: bytes) -> dict:
    if not settings.gemini_api_key:
        raise GeminiNotConfigured("GEMINI_API_KEY is not set.")

    payload = {
        "contents": [{
            "parts": [
                {"text": EXTRACTION_PROMPT},
                {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(image_bytes).decode()}},
            ]
        }],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA},
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
        logging.error(f"Gemini extraction failed: {e}")
        return {"merchant": None, "amount": None, "currency": "ZMW", "date": str(date.today()), "category": None}

    try:
        text_out = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text_out)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logging.error(f"Could not parse Gemini response: {e}")
        return {"merchant": None, "amount": None, "currency": "ZMW", "date": str(date.today()), "category": None}

    return {
        "merchant": parsed.get("merchant"),
        "amount": parsed.get("amount"),
        "currency": parsed.get("currency") or "ZMW",
        "date": parsed.get("date") or str(date.today()),
        "category": parsed.get("category"),
    }
