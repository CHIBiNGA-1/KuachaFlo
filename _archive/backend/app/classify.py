"""ONE classify+extract call for every money input.

Replaces the three-pipeline split (receipt photo / MoMo text / sales
sheet) that chose a pipeline by which account sent the message before
looking at the content. Now the content decides what it is; the account
only decides whose books it lands in.

Design for testability: build_*payload() and parse_classify_response()
are pure (golden-tested without network in tests/test_classify_golden.py);
only classify_image()/classify_text() touch the network.

Iron rules (see blueprint §6):
- The model may OMIT anything undeterminable; it must never invent.
- On structural doubt we degrade to a QUESTION, never to not_money.
  Only an explicit not_money verdict (or unparseable chit-chat handled
  by the caller) means "nothing to file." Losing money silently is the
  one unforgivable failure here.
"""

import base64
import json
import logging
from datetime import datetime

import httpx

from app.config import settings

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
REQUEST_TIMEOUT_SECONDS = 30.0

KINDS = ("receipt", "momo_transaction", "sales_sheet", "supplier_note", "not_money")

CLASSIFY_PROMPT = (
    "You are the money-understanding engine for a Zambian finance app. "
    "Look at this input (a photo or a forwarded message) and decide what it is.\n\n"
    "kind: one of receipt | momo_transaction | sales_sheet | supplier_note | not_money.\n"
    "- receipt: a till slip, invoice, or proof-of-purchase for money SPENT.\n"
    "- momo_transaction: a mobile-money or bank alert (Airtel Money, MTN MoMo, "
    "Zamtel Kwacha, bank SMS) confirming a payment, transfer, withdrawal, deposit, "
    "or airtime purchase.\n"
    "- sales_sheet: a shop's record of the day — handwritten tally, till roll, or "
    "notebook page listing what was SOLD. Extract EVERY line item.\n"
    "- supplier_note: a delivery note, quote, or supplier invoice for the shop.\n"
    "- not_money: anything else — chat, jokes, questions, greetings, stickers. "
    "Most forwarded texts are this. Set kind=not_money and leave everything else out.\n\n"
    "When it IS money, extract: direction (in|out — from the user's perspective; "
    "a sale or received transfer is in, a purchase or sent transfer is out), "
    "amount (number, no symbols/commas), currency (3-letter code, default ZMW), "
    "party (merchant/business/person name, or the phone number for bare transfers), "
    "occurred_on (YYYY-MM-DD when visible; omit rather than guess), "
    "category (exactly ONE of the allowed list — omit if genuinely unclear), "
    "context_hint (personal|business — omit unless the content clearly says, e.g. "
    "a sales sheet is business), reference (transaction ref/ID when present), "
    "line_items for sales sheets (name as written, quantity default 1, unit_price, "
    "category_guess from the allowed list), confidence (high|medium|low), and "
    "needs_question (the ONE short question to ask when something essential is "
    "missing, e.g. 'What was the K50 to 097XXXXXXX for?' — else omit).\n\n"
    "If a field genuinely can't be determined, OMIT it rather than guessing. "
    "Do not invent numbers, names, or dates."
)


class GeminiNotConfigured(RuntimeError):
    """GEMINI_API_KEY missing — a setup problem, not a bad-input problem."""


class ClassifyFailed(RuntimeError):
    """Gemini unreachable or returned garbage — caller degrades gracefully."""


def build_schema(category_slugs: list[str]) -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "kind": {"type": "STRING", "enum": list(KINDS)},
            "direction": {"type": "STRING", "enum": ["in", "out"]},
            "amount": {"type": "NUMBER"},
            "currency": {"type": "STRING"},
            "party": {"type": "STRING"},
            "occurred_on": {"type": "STRING", "description": "YYYY-MM-DD"},
            "category": {"type": "STRING", "enum": category_slugs},
            "context_hint": {"type": "STRING", "enum": ["personal", "business"]},
            "reference": {"type": "STRING"},
            "line_items": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "quantity": {"type": "NUMBER"},
                        "unit_price": {"type": "NUMBER"},
                        "category_guess": {"type": "STRING", "enum": category_slugs},
                    },
                    "required": ["name", "quantity", "unit_price"],
                },
            },
            "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
            "needs_question": {"type": "STRING"},
        },
        "required": ["kind"],
    }


def build_payload(parts: list[dict], category_slugs: list[str]) -> dict:
    return {
        "contents": [{"parts": [{"text": CLASSIFY_PROMPT}, *parts]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": build_schema(category_slugs),
        },
    }


def build_image_payload(image_bytes: bytes, category_slugs: list[str]) -> dict:
    return build_payload(
        [{"inlineData": {
            "mimeType": "image/jpeg",
            "data": base64.b64encode(image_bytes).decode("utf-8"),
        }}],
        category_slugs,
    )


def build_text_payload(text: str, category_slugs: list[str]) -> dict:
    return build_payload([{"text": f"Message:\n{text}"}], category_slugs)


def _as_amount(value) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value > 0:
        return float(value)
    return None  # strings, zero, negatives → omit, never coerce-guess


def _as_date(value) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date().isoformat()
    except ValueError:
        return None


def _as_line_items(value) -> list[dict] | None:
    if not isinstance(value, list) or not value:
        return None
    items = []
    for raw in value:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()[:500]
        qty = raw.get("quantity")
        price = raw.get("unit_price")
        if not name or not isinstance(qty, (int, float)) or not isinstance(price, (int, float)):
            continue
        if qty < 1 or qty > 100000 or price < 0:
            continue
        items.append({
            "name": name,
            "quantity": int(qty),
            "unit_price": float(price),
            "category_guess": raw.get("category_guess"),
        })
    return items or None


def parse_classify_response(data: dict, category_slugs: list[str]) -> dict:
    """Normalizes one Gemini response into a draft dict. Raises
    ClassifyFailed only when the envelope itself is unusable (caller
    degrades to needs_review / try-again — see module docstring)."""
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as e:
        raise ClassifyFailed(f"unusable model envelope: {e}")

    if not isinstance(parsed, dict):
        raise ClassifyFailed("model returned a non-object")

    kind = parsed.get("kind")
    if kind not in KINDS:
        # Structural doubt → question, never silent loss.
        return {
            "kind": "receipt", "direction": "out", "amount": None,
            "currency": "ZMW", "party": None, "occurred_on": None,
            "category": None, "context_hint": None, "reference": None,
            "line_items": None, "confidence": "low",
            "needs_question": "What was this? I couldn't quite make it out.",
            "raw": parsed,
        }

    if kind == "not_money":
        return {
            "kind": "not_money", "direction": None, "amount": None,
            "currency": "ZMW", "party": None, "occurred_on": None,
            "category": None, "context_hint": None, "reference": None,
            "line_items": None, "confidence": "high", "needs_question": None,
            "raw": parsed,
        }

    category = parsed.get("category")
    if category not in category_slugs:
        category = None  # enum should prevent this; belt and suspenders

    direction = parsed.get("direction")
    if direction not in ("in", "out"):
        direction = None  # ingestion applies kind-defaults (receipt→out, sales→in)

    confidence = parsed.get("confidence")
    if confidence not in ("high", "medium", "low"):
        confidence = "low"

    return {
        "kind": kind,
        "direction": direction,
        "amount": _as_amount(parsed.get("amount")),
        "currency": (parsed.get("currency") or "ZMW").strip().upper()[:3] or "ZMW",
        "party": str(parsed.get("party") or "").strip()[:500] or None,
        "occurred_on": _as_date(parsed.get("occurred_on")),
        "category": category,
        "context_hint": parsed.get("context_hint") if parsed.get("context_hint") in ("personal", "business") else None,
        "reference": str(parsed.get("reference") or "").strip()[:200] or None,
        "line_items": _as_line_items(parsed.get("line_items")),
        "confidence": confidence,
        "needs_question": str(parsed.get("needs_question") or "").strip()[:300] or None,
        "raw": parsed,
    }


def _post(payload: dict) -> dict:
    if not settings.gemini_api_key:
        raise GeminiNotConfigured(
            "GEMINI_API_KEY is not set. Get a free key (no card) at "
            "https://aistudio.google.com/apikey and add it to your environment."
        )
    url = GEMINI_ENDPOINT.format(model=settings.gemini_model)
    try:
        response = httpx.post(
            url,
            headers={"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        logging.error("Gemini API error %s: %s", e.response.status_code, e.response.text)
        raise ClassifyFailed(f"Gemini API error {e.response.status_code}")
    except httpx.RequestError as e:
        logging.error("Gemini API request failed: %s", e)
        raise ClassifyFailed("Could not reach Gemini's API")
    data = response.json()
    if not isinstance(data, dict):
        raise ClassifyFailed("model returned a non-object envelope")
    return data


def classify_image(image_bytes: bytes, category_slugs: list[str]) -> dict:
    return parse_classify_response(_post(build_image_payload(image_bytes, category_slugs)), category_slugs)


def classify_text(text: str, category_slugs: list[str]) -> dict:
    return parse_classify_response(_post(build_text_payload(text, category_slugs)), category_slugs)
