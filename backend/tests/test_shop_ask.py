"""The WhatsApp read side: questions answered from the shop's own rows.

The load-bearing case is the last one — a sales tally must never be
mistaken for a question, because answering it would silently drop a
sale on the floor instead of ringing it up.
"""

import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Business, Profile
from app.shop_ask import low_stock_nudge, try_answer


@pytest.fixture
def shop_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/ask.db")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add(Profile(id="u1", plan="free"))
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


def _product(client, **over):
    payload = {
        "name": "Coca-Cola 500ml", "sku": f"CC-{uuid.uuid4().hex[:6]}",
        "category": "Beverages", "price": 15.0, "cost": 11.0,
        "stock": 100, "reorder_at": 10, "unit": "500 ml",
    }
    payload.update(over)
    r = client.post("/api/v1/shop/products", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def _sale(client, product_id, qty, date=None):
    r = client.post("/api/v1/shop/sales", json={
        "items": [{"product_id": product_id, "quantity": qty}],
        "status": "Completed", "customer": "Walk-in",
        "date": date or datetime.utcnow().date().isoformat(),
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_low_lists_only_items_at_or_below_reorder(client, shop_db, business):
    _product(client, name="Sugar 1kg", stock=2, reorder_at=5)
    _product(client, name="Cooking Oil", stock=0, reorder_at=3)
    _product(client, name="Rice 5kg", stock=40, reorder_at=10)

    answer = try_answer(shop_db, business, "low")
    assert "Sugar 1kg" in answer
    assert "Cooking Oil" in answer
    assert "out of stock" in answer
    assert "Rice 5kg" not in answer


def test_low_when_shelf_is_healthy(client, shop_db, business):
    _product(client, name="Rice 5kg", stock=40, reorder_at=10)
    assert "good shape" in try_answer(shop_db, business, "stock")


def test_today_counts_completed_sales(client, shop_db, business):
    p = _product(client, name="Sugar 1kg", stock=50, reorder_at=5, price=20.0)
    _sale(client, p["id"], 3)

    answer = try_answer(shop_db, business, "today")
    assert "60.00" in answer          # 3 x 20
    assert "1 sale" in answer


def test_today_with_nothing_rung_up(client, shop_db, business):
    assert "No sales" in try_answer(shop_db, business, "today")


def test_week_window_excludes_older_sales(client, shop_db, business):
    p = _product(client, name="Sugar 1kg", stock=99, reorder_at=5, price=10.0)
    old = (datetime.utcnow().date() - timedelta(days=30)).isoformat()
    _sale(client, p["id"], 1, date=old)

    assert "No sales in the last 7 days" in try_answer(shop_db, business, "week")


def test_help_is_offered(client, shop_db, business):
    assert "low" in try_answer(shop_db, business, "help")


def test_nudge_fires_only_for_items_now_at_reorder(client, shop_db, business):
    low = _product(client, name="Sugar 1kg", stock=2, reorder_at=5)
    fine = _product(client, name="Rice 5kg", stock=40, reorder_at=10)

    nudge = low_stock_nudge(shop_db, business, [low["id"], fine["id"]])
    assert "Sugar 1kg" in nudge
    assert "Rice 5kg" not in nudge

    assert low_stock_nudge(shop_db, business, [fine["id"]]) is None
    assert low_stock_nudge(shop_db, business, []) is None


def test_a_sales_tally_is_never_swallowed_as_a_question(client, shop_db, business):
    """The one that actually matters: anything outside the fixed
    vocabulary must return None so it reaches the capture pipeline and
    gets rung up, rather than being answered and dropped."""
    for tally in [
        "sugar 3, oil 2",
        "5 bread 15",
        "sold 10 rice today",          # contains "today" but isn't the question
        "low fat milk 4",              # contains "low" but isn't the question
    ]:
        assert try_answer(shop_db, business, tally) is None
