"""Phase 2 pipeline behaviour beyond the HTTP contract."""

from app.main import app as _app


def _stub(router_fn):
    from app.routers import ingest
    _app.dependency_overrides[ingest.get_classifier] = lambda: {"image": router_fn, "text": router_fn}
    return ingest


def _thin(*a, **k):
    return {
        "kind": "momo_transaction", "direction": "out", "amount": 50.0,
        "currency": "ZMW", "party": "0977123456", "occurred_on": "2026-09-10",
        "category": None, "context_hint": None, "reference": "ABC",
        "line_items": None, "confidence": "low",
        "needs_question": "What was the K50 for?",
    }


def test_second_identical_forward_files_silently(client, db, seed_categories):
    from app.routers import ingest
    _stub(_thin)
    try:
        first = client.post("/api/v1/ingest/text", json={"text": "sent K50"}).json()
        assert first["draft_id"]  # thin → question

        ans = client.post("/api/v1/ingest/clarify",
                          json={"draft_id": first["draft_id"], "answer": "meals"})
        assert ans.status_code == 201

        # Same model output — but memory now knows this number.
        second = client.post("/api/v1/ingest/text", json={"text": "sent K50 again"})
        assert second.status_code == 201, second.text
        assert second.json()["entry"]["category"]["slug"] == "meals"
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)


def test_gibberish_answer_gets_one_followup_then_files_review(client, db, seed_categories):
    from app.routers import ingest
    _stub(_thin)
    try:
        first = client.post("/api/v1/ingest/text", json={"text": "sent K50"}).json()
        follow = client.post("/api/v1/ingest/clarify",
                             json={"draft_id": first["draft_id"], "answer": "asdfqwer"})
        assert follow.status_code == 202  # one follow-up, not silent filing
        filed = client.post("/api/v1/ingest/clarify",
                            json={"draft_id": follow.json()["draft_id"], "answer": "still gibberish"})
        assert filed.status_code == 201
        assert filed.json()["status"] == "needs_review"
        assert "gibberish" in (filed.json().get("note") or "")
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)


def test_plan_limit_counts_ledger_entries(client, db, user, seed_categories):
    from app.models import LedgerEntry
    import uuid
    from datetime import date
    for i in range(100):  # free plan = 100 entries
        db.add(LedgerEntry(id=str(uuid.uuid4()), user_id=user.id, direction="out",
                           amount=1, currency="ZMW", party=f"P{i}",
                           occurred_on=date(2026, 9, 1), source="app_manual",
                           status="processed"))
    db.commit()
    from app.routers import ingest

    def receipt(*a, **k):
        return {**_thin(*a, **k), "kind": "receipt", "party": "Shop",
                "category": "meals", "confidence": "high"}

    _stub(receipt)
    try:
        r = client.post("/api/v1/ingest/text", json={"text": "Shop 100"})
        assert r.status_code == 402
        assert "100-entry" in r.text
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)
