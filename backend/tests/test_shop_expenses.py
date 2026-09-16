"""Contract tests for shop expenses: money out that isn't stock."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Business, LedgerEntry, Profile


@pytest.fixture
def shop_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/expenses.db")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add(Profile(id="u1", plan="free"))
    session.add(Profile(id="u2", plan="free"))
    session.commit()
    yield session
    session.close()


@pytest.fixture
def client(shop_db):
    from app.db import get_db
    from app.deps import get_current_user
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "s@test.zm"}
    app.dependency_overrides[get_db] = lambda: shop_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def business(client, shop_db):
    client.get("/api/v1/shop/overview").raise_for_status()
    return shop_db.query(Business).filter_by(owner_user_id="u1").one()


def _expense(client, **over):
    payload = {
        "name": "Store rent", "amount": 2400.0, "category": "Rent",
        "date": "2026-09-01", "method": "Bank transfer", "paid": "Paid",
    }
    payload.update(over)
    r = client.post("/api/v1/shop/expenses", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_expense_crud_round_trip(client, business):
    e = _expense(client, notes="September")
    assert e["name"] == "Store rent"
    assert e["amount"] == 2400.0
    assert e["method"] == "Bank transfer"
    assert e["paid"] == "Paid"

    listed = client.get("/api/v1/shop/expenses").json()["items"]
    assert [x["id"] for x in listed] == [e["id"]]

    upd = client.patch(f"/api/v1/shop/expenses/{e['id']}",
                       json={"paid": "Unpaid", "amount": 2500.0})
    assert upd.status_code == 200, upd.text
    assert upd.json()["paid"] == "Unpaid"
    assert upd.json()["amount"] == 2500.0

    assert client.delete(f"/api/v1/shop/expenses/{e['id']}").status_code == 204
    assert client.get("/api/v1/shop/expenses").json()["items"] == []


def test_expense_validation(client, business):
    assert client.post("/api/v1/shop/expenses", json={"amount": 10}).status_code == 422
    assert client.post("/api/v1/shop/expenses",
                       json={"name": "X", "amount": 0}).status_code == 422
    assert client.post("/api/v1/shop/expenses",
                       json={"name": "X", "amount": 10, "category": "Nope"}).status_code == 422
    assert client.post("/api/v1/shop/expenses",
                       json={"name": "X", "amount": 10, "paid": "Maybe"}).status_code == 422


def test_order_money_invisible_to_expenses(client, shop_db, business):
    p = client.post("/api/v1/shop/products", json={
        "name": "Coke", "sku": "CK-1", "category": "Beverages",
        "price": 15, "cost": 11, "stock": 10,
    }).json()
    client.post("/api/v1/shop/sales", json={
        "items": [{"product_id": p["id"], "quantity": 1}], "status": "Completed",
    }).raise_for_status()
    money_id = shop_db.query(LedgerEntry).filter(
        LedgerEntry.business_id == business.id,
        LedgerEntry.source == "shop_order").one().id

    assert client.patch(f"/api/v1/shop/expenses/{money_id}", json={"amount": 1}).status_code == 404
    assert client.delete(f"/api/v1/shop/expenses/{money_id}").status_code == 404


def test_expense_idempotent_replay(client, business):
    key = str(uuid.uuid4())
    body = {"name": "Airtime", "amount": 50, "category": "Utilities", "method": "Mobile money"}
    first = client.post("/api/v1/shop/expenses", json=body, headers={"Idempotency-Key": key})
    assert first.status_code == 201
    second = client.post("/api/v1/shop/expenses", json=body, headers={"Idempotency-Key": key})
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert len(client.get("/api/v1/shop/expenses").json()["items"]) == 1


def test_expense_shape(client, shop_db, business):
    e = _expense(client)
    row = shop_db.query(LedgerEntry).filter_by(id=e["id"]).one()
    assert row.business_id == business.id
    assert row.direction == "out"
    assert row.source == "shop_expense"
    assert row.status == "processed"
    assert row.is_deleted is False


def test_expenses_autoprovisions_for_a_new_user(client, shop_db):
    from app.db import get_db
    from app.deps import get_current_user
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: {"id": "u2"}
    app.dependency_overrides[get_db] = lambda: shop_db
    try:
        r = TestClient(app).get("/api/v1/shop/expenses")
        assert r.status_code == 200
        assert r.json()["items"] == []
    finally:
        app.dependency_overrides.clear()