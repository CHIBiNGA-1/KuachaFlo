"""Contract tests for the unified ledger API (blueprint §8).

Target shape per entry:
  id, context (personal|business), direction (in|out), party, amount,
  currency, occurred_on, category {id,name,slug,icon} | null,
  source, status, confidence, image_path, thumbnail_path,
  line_items, order_ref, business_id, created_at

Phase 1 turns these green.
"""

from datetime import date

import pytest

from conftest import make_entry


# ── reads ────────────────────────────────────────────────────────────────

def test_ledger_empty_returns_empty_envelope(client, seed_categories):
    r = client.get("/api/v1/ledger")
    assert r.status_code == 200
    assert r.json() == {"items": [], "next_cursor": None}


def test_ledger_combines_personal_and_business_newest_first(
    client, db, user, business, seed_categories
):
    make_entry(db, user, party="Old lunch", amount=20, occurred_on=date(2026, 9, 1))
    make_entry(
        db, user, party="Shop sale", amount=500, direction="in",
        business_id=business.id, occurred_on=date(2026, 9, 5),
    )
    make_entry(db, user, party="Fuel", amount=300, occurred_on=date(2026, 9, 3))

    r = client.get("/api/v1/ledger")
    assert r.status_code == 200
    items = r.json()["items"]
    assert [i["party"] for i in items] == ["Shop sale", "Fuel", "Old lunch"]
    assert [i["context"] for i in items] == ["business", "personal", "personal"]
    assert items[0]["direction"] == "in"
    assert items[0]["business_id"] == business.id
    assert items[1]["business_id"] is None


def test_ledger_item_shape(client, db, user, seed_categories):
    make_entry(
        db, user, party="Shoprite", amount=123.45,
        category_id=seed_categories["meals"].id,
    )
    r = client.get("/api/v1/ledger")
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["party"] == "Shoprite"
    assert item["amount"] == 123.45
    assert item["currency"] == "ZMW"
    assert item["occurred_on"] == "2026-09-01"
    assert item["context"] == "personal"
    assert item["direction"] == "out"
    assert item["status"] == "processed"
    assert item["confidence"] == "high"
    assert item["category"] == {
        "id": "cat-meals", "name": "Meals & Food", "slug": "meals", "icon": "🍔",
    }
    for key in ("id", "source", "line_items", "order_ref", "business_id", "created_at"):
        assert key in item, f"missing key: {key}"


def test_ledger_context_filter(client, db, user, business, seed_categories):
    make_entry(db, user, party="Lunch", amount=20)
    make_entry(db, user, party="Sale", amount=100, direction="in", business_id=business.id)

    personal = client.get("/api/v1/ledger?context=personal").json()["items"]
    assert [i["party"] for i in personal] == ["Lunch"]

    shop = client.get("/api/v1/ledger?context=business").json()["items"]
    assert [i["party"] for i in shop] == ["Sale"]


def test_ledger_filters_from_to_q_category_needs_review(
    client, db, user, seed_categories
):
    make_entry(db, user, party="Shoprite Ndola", amount=100,
               occurred_on=date(2026, 8, 10), category_id=seed_categories["meals"].id)
    make_entry(db, user, party="TotalEnergies", amount=300,
               occurred_on=date(2026, 9, 2), status="needs_review", confidence="low")

    assert [i["party"] for i in client.get("/api/v1/ledger?from=2026-09-01").json()["items"]] == ["TotalEnergies"]
    assert [i["party"] for i in client.get("/api/v1/ledger?to=2026-08-31").json()["items"]] == ["Shoprite Ndola"]
    assert [i["party"] for i in client.get("/api/v1/ledger?q=total").json()["items"]] == ["TotalEnergies"]
    assert [i["party"] for i in client.get("/api/v1/ledger?q=SHOPRITE").json()["items"]] == ["Shoprite Ndola"]
    assert client.get("/api/v1/ledger?category_id=cat-meals").json()["items"][0]["party"] == "Shoprite Ndola"
    assert client.get("/api/v1/ledger?needs_review=true").json()["items"][0]["party"] == "TotalEnergies"


def test_ledger_pagination(client, db, user, seed_categories):
    for day in range(1, 6):
        make_entry(db, user, party=f"Day {day}", amount=day, occurred_on=date(2026, 9, day))

    page1 = client.get("/api/v1/ledger?limit=2").json()
    assert [i["party"] for i in page1["items"]] == ["Day 5", "Day 4"]
    assert page1["next_cursor"]

    page2 = client.get(f"/api/v1/ledger?limit=2&cursor={page1['next_cursor']}").json()
    assert [i["party"] for i in page2["items"]] == ["Day 3", "Day 2"]
    assert page2["next_cursor"]

    page3 = client.get(f"/api/v1/ledger?limit=2&cursor={page2['next_cursor']}").json()
    assert [i["party"] for i in page3["items"]] == ["Day 1"]
    assert page3["next_cursor"] is None


def test_ledger_default_response_is_paginated_envelope(client, db, user, seed_categories):
    make_entry(db, user, party="Lunch", amount=20)
    body = client.get("/api/v1/ledger").json()
    assert set(body.keys()) == {"items", "next_cursor"}
    assert [i["party"] for i in body["items"]] == ["Lunch"]


# ── summary ──────────────────────────────────────────────────────────────

def test_summary_combined_totals(client, db, user, business, seed_categories):
    make_entry(db, user, party="Lunch", amount=50, occurred_on=date(2026, 9, 2),
               category_id=seed_categories["meals"].id)
    make_entry(db, user, party="Salary", amount=5000, direction="in",
               occurred_on=date(2026, 9, 1))
    make_entry(db, user, party="Sale", amount=800, direction="in",
               business_id=business.id, occurred_on=date(2026, 9, 3))
    make_entry(db, user, party="Stock", amount=300, business_id=business.id,
               occurred_on=date(2026, 9, 4))
    make_entry(db, user, party="Blurry", amount=10, status="needs_review",
               occurred_on=date(2026, 9, 5))
    make_entry(db, user, party="Deleted", amount=999, is_deleted=True)

    s = client.get("/api/v1/ledger/summary").json()
    assert s["personal_out"] == 60  # Lunch + Blurry (review still counts)
    assert s["personal_in"] == 5000
    assert s["business_in"] == 800
    assert s["business_out"] == 300
    assert s["net"] == 5000 - 60 + 800 - 300
    assert s["needs_review_count"] == 1
    assert s["has_business"] is True
    by_cat = {c["slug"]: c["amount"] for c in s["by_category"]}
    assert by_cat["meals"] == 50
    months = {m["month"]: m for m in s["by_month"]}
    assert months["2026-09"]["out"] == 360
    assert months["2026-09"]["in"] == 5800


def test_summary_respects_context_and_period(client, db, user, business, seed_categories):
    make_entry(db, user, party="Aug lunch", amount=50, occurred_on=date(2026, 8, 10))
    make_entry(db, user, party="Sep sale", amount=800, direction="in",
               business_id=business.id, occurred_on=date(2026, 9, 3))

    sept = client.get("/api/v1/ledger/summary?from=2026-09-01&to=2026-09-30").json()
    assert sept["personal_out"] == 0
    assert sept["business_in"] == 800

    shop = client.get("/api/v1/ledger/summary?context=business").json()
    assert shop["business_in"] == 800
    assert shop["personal_out"] == 0


# ── writes ───────────────────────────────────────────────────────────────

def test_create_manual_entry_personal(client, db, user, seed_categories):
    r = client.post("/api/v1/ledger", json={
        "party": "Market tomatoes", "amount": 35, "direction": "out",
        "context": "personal", "occurred_on": "2026-09-10",
        "category_id": "cat-meals", "note": "cash",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["party"] == "Market tomatoes"
    assert body["amount"] == 35
    assert body["context"] == "personal"
    assert body["category"]["slug"] == "meals"


def test_create_manual_entry_business(client, db, user, business, seed_categories):
    r = client.post("/api/v1/ledger", json={
        "party": "Supplier", "amount": 1200, "direction": "out",
        "context": "business", "occurred_on": "2026-09-10",
    })
    assert r.status_code == 201, r.text
    assert r.json()["context"] == "business"
    assert r.json()["business_id"] == business.id


def test_create_business_entry_without_shop_is_rejected(client, db, user, seed_categories):
    r = client.post("/api/v1/ledger", json={
        "party": "Supplier", "amount": 1200, "direction": "out", "context": "business",
    })
    assert r.status_code == 422, r.text


def test_create_entry_validation(client, seed_categories):
    assert client.post("/api/v1/ledger", json={
        "party": "X", "amount": -5, "direction": "out", "context": "personal",
    }).status_code == 422
    assert client.post("/api/v1/ledger", json={
        "party": "X", "amount": 5, "direction": "sideways", "context": "personal",
    }).status_code == 422
    assert client.post("/api/v1/ledger", json={
        "party": "", "amount": 5, "direction": "out", "context": "personal",
    }).status_code == 422
    assert client.post("/api/v1/ledger", json={
        "party": "X", "amount": 5, "direction": "out", "context": "personal",
        "category_id": "cat-nope",
    }).status_code == 422


def test_patch_entry_fields(client, db, user, seed_categories):
    row = make_entry(db, user, party="Typo", amount=10)
    r = client.patch(f"/api/v1/ledger/{row.id}", json={
        "party": "Fixed", "amount": 12.5, "category_id": "cat-meals",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["party"], body["amount"]) == ("Fixed", 12.5)
    assert body["category"]["slug"] == "meals"
    # A corrected entry clears needs_review.
    assert body["status"] == "processed"


def test_patch_writes_memory_on_category_correction(client, db, user, seed_categories):
    from app import models
    if not hasattr(models, "Memory"):
        pytest.skip("Memory model lands with Phase 1")
    row = make_entry(db, user, party="Hungry Lion", amount=85)
    r = client.patch(f"/api/v1/ledger/{row.id}", json={"category_id": "cat-meals"})
    assert r.status_code == 200, r.text
    mem = db.query(models.Memory).filter(
        models.Memory.user_id == user.id,
        models.Memory.key == "merchant:hungry lion",
    ).first()
    assert mem is not None
    assert mem.category_id == "cat-meals"

    import pytest  # noqa: E402  (kept local: module must import pre-Phase-1)


def test_patch_context_flip_personal_to_business(client, db, user, business, seed_categories):
    row = make_entry(db, user, party="Bulk rice", amount=400,
                     category_id=seed_categories["meals"].id)
    r = client.patch(f"/api/v1/ledger/{row.id}", json={"context": "business"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["context"] == "business"
    assert body["business_id"] == business.id


def test_patch_context_flip_remaps_invalid_category(client, db, user, business, seed_categories):
    # accessories is personal-only → flipping to business must not keep it.
    from app.models import Category
    db.add(Category(id="cat-acc", name="Accessories", slug="accessories", icon="🎒"))
    db.commit()
    row = make_entry(db, user, party="Backpack", amount=400, category_id="cat-acc")
    r = client.patch(f"/api/v1/ledger/{row.id}", json={"context": "business"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["context"] == "business"
    assert body["category"]["slug"] == "other"
    assert body["status"] == "needs_review"


def test_delete_soft_deletes(client, db, user, seed_categories):
    row = make_entry(db, user, party="Oops", amount=10)
    assert client.delete(f"/api/v1/ledger/{row.id}").status_code == 204
    assert client.get("/api/v1/ledger").json()["items"] == []
    assert client.get("/api/v1/ledger/summary").json()["personal_out"] == 0


# ── isolation & errors ───────────────────────────────────────────────────

def test_users_cannot_see_each_other(client_as_other, db, user, seed_categories):
    make_entry(db, user, party="Private", amount=10)
    assert client_as_other.get("/api/v1/ledger").json()["items"] == []


def test_users_cannot_mutate_each_other(client_as_other, db, user, seed_categories):
    row = make_entry(db, user, party="Private", amount=10)
    assert client_as_other.patch(f"/api/v1/ledger/{row.id}", json={"party": "Hacked"}).status_code == 404
    assert client_as_other.delete(f"/api/v1/ledger/{row.id}").status_code == 404


def test_missing_entry_is_404(client, seed_categories):
    assert client.patch("/api/v1/ledger/does-not-exist", json={"party": "x"}).status_code == 404
    assert client.delete("/api/v1/ledger/does-not-exist").status_code == 404
