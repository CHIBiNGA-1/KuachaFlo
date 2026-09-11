"""Old clients keep working through Phase 1: the receipts endpoints, the
business endpoints (now ledger-backed), /me, and categories all hold
their shapes while the new ledger API grows alongside."""

from conftest import make_entry


def test_receipts_list_shape_unchanged(client, db, user, seed_categories):
    from app.models import Receipt
    import uuid
    from datetime import date
    db.add(Receipt(id=str(uuid.uuid4()), user_id=user.id, merchant="Shoprite",
                   total_amount=50, currency="ZMW", purchase_date=date(2026, 9, 1),
                   status="processed"))
    db.commit()
    from app.ledger_backfill import backfill_receipts  # what init_db does on boot
    backfill_receipts(db)
    r = client.get("/api/v1/receipts")
    assert r.status_code == 200
    assert r.json()[0]["merchant"] == "Shoprite"


def test_business_expenses_roundtrip_on_ledger(client, db, user, business):
    created = client.post("/api/v1/business/expenses", json={
        "party": "Zambeef", "amount": 900, "note": "stock",
    })
    assert created.status_code == 200, created.text
    assert created.json()["merchant"] == "Zambeef"

    listed = client.get("/api/v1/business/expenses")
    assert [e["merchant"] for e in listed.json()] == ["Zambeef"]

    # ...and it shows up in the unified timeline as a business entry.
    timeline = client.get("/api/v1/ledger?context=business").json()["items"]
    assert any(e["party"] == "Zambeef" and e["amount"] == 900 for e in timeline)


def test_me_and_categories_shape(client, seed_categories):
    me = client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["plan"] == "free"

    cats = client.get("/api/v1/categories").json()
    assert {"id", "name", "slug", "icon", "kinds"} <= set(cats[0].keys())
