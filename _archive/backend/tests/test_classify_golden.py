"""Golden tests for the unified classifier's parsing/normalization.

No network — these feed canned Gemini envelopes into
parse_classify_response() and pin the draft shape. If the model changes
phrasing, these don't care; if WE change normalization, these scream.
"""

import pytest

from app.classify import build_schema, build_text_payload, parse_classify_response, ClassifyFailed

SLUGS = ["meals", "fuel-transport", "other"]


def _envelope(obj: dict) -> dict:
    import json
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(obj)}]}}]}


def test_receipt_golden():
    d = parse_classify_response(_envelope({
        "kind": "receipt", "direction": "out", "amount": 123.45, "currency": "ZMW",
        "party": "Shoprite", "occurred_on": "2026-09-10", "category": "meals",
        "confidence": "high",
    }), SLUGS)
    assert d["kind"] == "receipt" and d["amount"] == 123.45
    assert d["party"] == "Shoprite" and d["occurred_on"] == "2026-09-10"
    assert d["category"] == "meals" and d["confidence"] == "high"
    assert d["needs_question"] is None


def test_momo_thin_golden():
    d = parse_classify_response(_envelope({
        "kind": "momo_transaction", "direction": "out", "amount": 50,
        "currency": "ZMW", "party": "097XXXXXXX", "reference": "ABC123",
        "confidence": "low", "needs_question": "What was the K50 to 097XXXXXXX for?",
    }), SLUGS)
    assert d["kind"] == "momo_transaction"
    assert d["category"] is None and d["confidence"] == "low"
    assert "K50" in d["needs_question"]


def test_momo_airtime_self_evident():
    d = parse_classify_response(_envelope({
        "kind": "momo_transaction", "direction": "out", "amount": 20,
        "party": "Airtel Airtime", "category": "other", "confidence": "medium",
    }), SLUGS)
    assert d["amount"] == 20 and d["category"] == "other"


def test_sales_sheet_golden():
    d = parse_classify_response(_envelope({
        "kind": "sales_sheet", "direction": "in", "amount": 730,
        "party": "Day sales", "context_hint": "business", "confidence": "high",
        "line_items": [
            {"name": "Coke", "quantity": 10, "unit_price": 15, "category_guess": "meals"},
            {"name": "  ", "quantity": 2, "unit_price": 5},  # dropped: no name
            {"name": "Bad", "quantity": "many", "unit_price": 5},  # dropped: bad qty
        ],
    }), SLUGS)
    assert d["kind"] == "sales_sheet" and d["context_hint"] == "business"
    assert d["line_items"] == [
        {"name": "Coke", "quantity": 10, "unit_price": 15.0, "category_guess": "meals"}
    ]


def test_chit_chat_is_not_money():
    d = parse_classify_response(_envelope({"kind": "not_money"}), SLUGS)
    assert d["kind"] == "not_money" and d["amount"] is None and d["party"] is None


def test_unknown_kind_degrades_to_question_never_loss():
    d = parse_classify_response(_envelope({"kind": "alien_artifact", "amount": 999}), SLUGS)
    assert d["kind"] == "receipt"  # question-path, not not_money
    assert d["confidence"] == "low" and d["needs_question"]


def test_garbage_amount_and_date_are_omitted_not_guessed():
    d = parse_classify_response(_envelope({
        "kind": "receipt", "amount": "lots", "occurred_on": "yesterday-ish",
        "party": "X", "confidence": "weird",
    }), SLUGS)
    assert d["amount"] is None and d["occurred_on"] is None
    assert d["confidence"] == "low"


def test_zero_and_negative_amounts_rejected():
    assert parse_classify_response(_envelope({"kind": "receipt", "amount": 0}), SLUGS)["amount"] is None
    assert parse_classify_response(_envelope({"kind": "receipt", "amount": -5}), SLUGS)["amount"] is None
    assert parse_classify_response(_envelope({"kind": "receipt", "amount": True}), SLUGS)["amount"] is None


def test_off_taxonomy_category_dropped():
    d = parse_classify_response(_envelope({
        "kind": "receipt", "amount": 10, "category": "moon-cheese",
    }), SLUGS)
    assert d["category"] is None


def test_bad_direction_falls_back_to_kind_default_slot():
    d = parse_classify_response(_envelope({
        "kind": "receipt", "amount": 10, "direction": "sideways",
    }), SLUGS)
    assert d["direction"] is None  # ingestion applies receipt→out


def test_unusable_envelope_raises_classify_failed():
    with pytest.raises(ClassifyFailed):
        parse_classify_response({"nope": True}, SLUGS)
    with pytest.raises(ClassifyFailed):
        parse_classify_response({"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}, SLUGS)


def test_schema_constrains_category_and_kind():
    schema = build_schema(SLUGS)
    assert schema["properties"]["category"]["enum"] == SLUGS
    assert set(schema["properties"]["kind"]["enum"]) == {
        "receipt", "momo_transaction", "sales_sheet", "supplier_note", "not_money"}
    payload = build_text_payload("hello", SLUGS)
    assert payload["generationConfig"]["responseMimeType"] == "application/json"
