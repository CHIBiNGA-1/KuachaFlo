"""Contract tests for the sales-sheet sweep (ported from the archive)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Business, LedgerEntry, Order, Product, Profile


@pytest.fixture
def shop_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/sweep.db")
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


def _sheet(shop_db, business, line_items, party="Day sales"):
    row = LedgerEntry(
        user_id="u1", business_id=business.id, direction="in", amount=100.0,
        currency="ZMW", party=party, occurred_on=date(2026, 9, 10),
        source="sales_sheet", status="processed", line_items=line_items,
    )
    shop_db.add(row)
    shop_db.commit()
    return row


def test_sweep_converts_sheet_to_order_with_stock(client, shop_db, business):
    coke = Product(business_id=business.id, name="Coca-Cola 500ml", sku="CC-1",
                   sku_normalized="cc-1", category="Beverages", price=15.0,
                   cost=11.0, stock=10, reorder_at=2)
    shop_db.add(coke)
    shop_db.commit()
    sheet = _sheet(shop_db, business, [
        {"name": "coca-cola 500ML", "quantity": 2, "unit_price": 15.0},
        {"name": "New Thing", "quantity": 1, "unit_price": 5.0},
    ])

    r = client.post("/api/v1/shop/sweep-sales")
    assert r.status_code == 200, r.text
    report = r.json()
    assert report["swept"] == 1
    assert report["skipped"] == 0
    assert report["created_products"] == ["New Thing"]

    sale = shop_db.query(Order).filter_by(business_id=business.id, kind="sale").one()
    assert sale.status == "Completed"
    assert sale.reference == "#SW-1001"
    assert float(sale.amount_total) == 35.0

    shop_db.refresh(coke)
    assert coke.stock == 8  # matched line decrements real stock
    new = shop_db.query(Product).filter_by(business_id=business.id, name="New Thing").one()
    assert new.price == 5.0 and new.cost == 5.0
    assert new.stock == 0  # created with exactly-covering stock, then sold

    shop_db.refresh(sheet)
    assert sheet.is_deleted is True  # income never double-counts
    assert sheet.order_id == sale.id


def test_sweep_is_idempotent_and_skips_empty(client, shop_db, business):
    _sheet(shop_db, business, [
        {"name": "Something", "quantity": 1, "unit_price": 9.0},
    ])
    _sheet(shop_db, business, None)
    _sheet(shop_db, business, [])

    first = client.post("/api/v1/shop/sweep-sales").json()
    assert (first["swept"], first["skipped"]) == (1, 2)

    second = client.post("/api/v1/shop/sweep-sales").json()
    assert second["swept"] == 0  # swept stays swept
    assert second["skipped"] == 2  # empties wait honestly for real lines


def test_sweep_fresh_shop_sweeps_nothing(client, business):
    assert client.post("/api/v1/shop/sweep-sales").json() == {
        "swept": 0, "skipped": 0, "created_products": [],
    }