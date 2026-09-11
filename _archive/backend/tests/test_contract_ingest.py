"""Contract tests for the unified ingestion API (blueprint §6 + §8).

The classifier is stubbed via dependency override — these tests pin the
HTTP/API contract, not Gemini. Golden classifier fixtures land in Phase 2
beside classify.py.

Red until Phase 2.
"""

import io

import pytest
from PIL import Image


def _jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), "white").save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture()
def stub_classify_receipt(client):
    """Override the classifier dependency with a canned receipt draft."""
    from app.routers import ingest

    def fake(*a, **k):
        return {
            "kind": "receipt",
            "direction": "out",
            "amount": 123.45,
            "currency": "ZMW",
            "party": "Shoprite",
            "occurred_on": "2026-09-10",
            "category": "meals",
            "context_hint": "personal",
            "reference": None,
            "line_items": None,
            "confidence": "high",
            "needs_question": None,
        }

    from app.main import app as _app
    _app.dependency_overrides[ingest.get_classifier] = lambda: {"image": fake, "text": fake}
    try:
        yield fake
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)


def test_ingest_photo_files_entry(client, db, seed_categories, stub_classify_receipt):
    r = client.post(
        "/api/v1/ingest/photo",
        files={"file": ("receipt.jpg", _jpeg(), "image/jpeg")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["entry"]["party"] == "Shoprite"
    assert body["entry"]["amount"] == 123.45
    assert body["entry"]["category"]["slug"] == "meals"
    assert body["question"] is None


def test_ingest_photo_rejects_non_image(client, seed_categories, stub_classify_receipt):
    r = client.post(
        "/api/v1/ingest/photo",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 400


def test_ingest_thin_input_returns_question_not_entry(client, db, seed_categories):
    from app.main import app as _app
    from app.routers import ingest

    def thin(*a, **k):
        return {
            "kind": "momo_transaction", "direction": "out", "amount": 50.0,
            "currency": "ZMW", "party": "0977123456", "occurred_on": "2026-09-10",
            "category": None, "context_hint": None, "reference": "ABC123",
            "line_items": None, "confidence": "low",
            "needs_question": "What was the K50 to 0977123456 for?",
        }

    _app.dependency_overrides[ingest.get_classifier] = lambda: {"image": thin, "text": thin}
    try:
        r = client.post("/api/v1/ingest/text", json={"text": "You sent K50 to 0977123456. Ref ABC123."})
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)

    assert r.status_code == 202, r.text
    body = r.json()
    assert body["entry"] is None
    assert body["draft_id"]
    assert "K50" in body["question"]

    # Nothing filed yet — the timeline stays empty. No ghost money.
    assert client.get("/api/v1/ledger").json()["items"] == []


def test_ingest_clarify_commits_entry_and_learns(client, db, seed_categories):
    from app.main import app as _app
    from app.routers import ingest

    calls = {"n": 0}

    def thin_then_done(*a, **k):
        calls["n"] += 1
        return {
            "kind": "momo_transaction", "direction": "out", "amount": 50.0,
            "currency": "ZMW", "party": "0977123456", "occurred_on": "2026-09-10",
            "category": None, "context_hint": None, "reference": "ABC123",
            "line_items": None, "confidence": "low",
            "needs_question": "What was the K50 for?",
        }

    _app.dependency_overrides[ingest.get_classifier] = lambda: {"image": thin_then_done, "text": thin_then_done}
    try:
        created = client.post("/api/v1/ingest/text", json={"text": "sent K50"}).json()
        # Answering with a category name files the entry.
        r = client.post("/api/v1/ingest/clarify", json={
            "draft_id": created["draft_id"], "answer": "Meals & Food",
        })
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)

    assert r.status_code == 201, r.text
    assert r.json()["party"] == "0977123456"
    assert r.json()["category"]["slug"] == "meals"

    # Same counterparty next time files silently — memory learned it.
    from app import models
    assert hasattr(models, "Memory")
    mem = db.query(models.Memory).all()
    assert any(m.key == "counterparty:0977123456" for m in mem)


def test_ingest_clarify_cancel_kills_draft(client, db, seed_categories):
    from app.main import app as _app
    from app.routers import ingest

    def thin(*a, **k):
        return {
            "kind": "momo_transaction", "direction": "out", "amount": 50.0,
            "currency": "ZMW", "party": "0977123456", "occurred_on": "2026-09-10",
            "category": None, "context_hint": None, "reference": None,
            "line_items": None, "confidence": "low",
            "needs_question": "What was the K50 for?",
        }

    _app.dependency_overrides[ingest.get_classifier] = lambda: {"image": thin, "text": thin}
    try:
        created = client.post("/api/v1/ingest/text", json={"text": "sent K50"}).json()
        r = client.post("/api/v1/ingest/clarify", json={"draft_id": created["draft_id"], "cancel": True})
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)

    assert r.status_code == 204
    assert client.get("/api/v1/ingest/drafts").json() == []


def test_ingest_not_money_replies_cleanly(client, seed_categories):
    from app.main import app as _app
    from app.routers import ingest

    def chat(*a, **k):
        return {
            "kind": "not_money", "direction": None, "amount": None,
            "currency": "ZMW", "party": None, "occurred_on": None,
            "category": None, "context_hint": None, "reference": None,
            "line_items": None, "confidence": "high", "needs_question": None,
        }

    _app.dependency_overrides[ingest.get_classifier] = lambda: {"image": chat, "text": chat}
    try:
        r = client.post("/api/v1/ingest/text", json={"text": "haha see you tomorrow"})
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)

    assert r.status_code == 200, r.text
    assert r.json()["entry"] is None
    assert r.json()["draft_id"] is None
