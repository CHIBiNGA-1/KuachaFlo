"""Category suggestion: the pure model, then the endpoint end-to-end."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Profile
from app.shop import validate as v
from app.shop.category_model import predict


def cat(name, examples=()):
    return predict(name, list(examples))["category"]


def test_category_list_is_seven_and_includes_gadgets():
    assert len(v.INVENTORY_CATEGORIES) == 7
    assert "Gadgets" in v.INVENTORY_CATEGORIES
    assert v.INVENTORY_CATEGORIES[-1] == "Other"


@pytest.mark.parametrize("name,expected", [
    ("Coca-Cola 500ml", "Beverages"),
    ("Full Cream Milk 1L", "Fresh & dairy"),
    ("Lays Chips", "Snacks"),
    ("Colgate Toothpaste", "Personal care & household"),
    ("Samsung Phone Charger", "Gadgets"),
    ("USB Cable 1m", "Gadgets"),
    ("Biscuits", "Snacks"),
])
def test_cold_start_uses_seed_knowledge(name, expected):
    assert cat(name) == expected


def test_survives_misspelling():
    assert cat("Colgat Toothpast") == "Personal care & household"


def test_abstains_when_it_has_nothing():
    assert cat("Xyzzy Widget") is None
    assert cat("") is None
    assert cat("500ml") is None  # only noise/units


def test_learns_a_shop_specific_name_from_one_example():
    assert cat("Mukwa Maize Meal 5kg", [("Mukwa Maize Meal 25kg", "Pantry")]) == "Pantry"


def test_shop_history_overrides_seed():
    ex = [("Soda Stream Machine", "Gadgets"), ("Soda Stream Machine Pro", "Gadgets")]
    r = predict("Soda Stream Gas Refill", ex)
    assert r["category"] == "Gadgets" and r["source"] == "learned"


def test_other_is_never_learned_or_suggested():
    ex = [("Chicken Inn Voucher", "Other")] * 5
    assert cat("Chicken Inn Voucher", ex) in (None, "Fresh & dairy")  # never "Other"
    assert cat("Plain Box", ex) is None


def test_reports_confidence_and_source():
    r = predict("Coca-Cola 500ml", [])
    assert r["source"] == "seed" and 0.5 < r["confidence"] <= 1.0


@pytest.fixture
def client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/c.db")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    db.add(Profile(id="u1", plan="free"))
    db.add(Profile(id="u2", plan="free"))
    db.commit()
    from app.db import get_db
    from app.deps import get_current_user
    from app.main import app

    state = {"uid": "u1"}
    app.dependency_overrides[get_current_user] = lambda: {"id": state["uid"], "email": "a@test.zm"}
    app.dependency_overrides[get_db] = lambda: db
    c = TestClient(app)
    c.state = state
    yield c
    app.dependency_overrides.clear()
    db.close()


def _add(client, name, category, sku):
    r = client.post("/api/v1/shop/products", json={
        "name": name, "sku": sku, "category": category, "price": 10, "cost": 5,
        "stock": 3, "reorder_at": 1,
    }, headers={"Idempotency-Key": str(uuid.uuid4())})
    assert r.status_code == 201, r.text


def test_endpoint_learns_from_saved_products_and_isolates_shops(client):
    assert client.get("/api/v1/shop/products/suggest-category", params={"name": "Mukwa Branded Flour"}).json()["category"] in (None, "Pantry")
    _add(client, "Mukwa Special Meal 25kg", "Pantry", "M1")
    r = client.get("/api/v1/shop/products/suggest-category", params={"name": "Mukwa Special Meal 5kg"}).json()
    assert r["category"] == "Pantry" and r["source"] == "learned"

    client.state["uid"] = "u2"  # a different shop must not see u1's history
    r2 = client.get("/api/v1/shop/products/suggest-category", params={"name": "Mukwa Special Meal 5kg"}).json()
    assert r2["source"] != "learned"


def test_endpoint_rejects_legacy_category_on_save(client):
    r = client.post("/api/v1/shop/products", json={
        "name": "Old", "sku": "O1", "category": "Household", "price": 1, "cost": 1, "stock": 1, "reorder_at": 0,
    }, headers={"Idempotency-Key": str(uuid.uuid4())})
    assert r.status_code == 422
