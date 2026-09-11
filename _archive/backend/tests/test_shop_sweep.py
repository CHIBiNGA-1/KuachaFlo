"""Sales sheets → real orders: the Phase 2 handoff, fulfilled."""

from datetime import date

from conftest import make_entry


def _sheet_entry(db, user, business):
    return make_entry(
        db, user, party="Evening tally", amount=730.0, direction="in",
        business_id=business.id, occurred_on=date(2026, 9, 10),
        source="sales_sheet", status="needs_review", confidence="medium",
        line_items=[
            {"name": "Coke", "quantity": 10, "unit_price": 15.0, "category_guess": "meals"},
            {"name": "Pepsi", "quantity": 40, "unit_price": 14.5, "category_guess": "nope"},
        ],
    )


def test_sweep_converts_sheet_to_order_with_stock(client, db, user, business):
    from app.models import LedgerEntry, Order, Product
    _sheet_entry(db, user, business)

    # Pre-existing product gets matched, not duplicated.
    db.add(Product(business_id=business.id, name="coke", sku="C-1", sku_normalized="c-1",
                   category="Beverages", price=15, cost=11, stock=100, reorder_at=10))
    db.commit()

    r = client.post("/api/v1/shop/sweep-sales")
    assert r.status_code == 200, r.text
    assert r.json()["swept"] == 1
    assert r.json()["created_products"] == ["Pepsi"]  # Coke matched

    sale = db.query(Order).filter(Order.kind == "sale").one()
    assert sale.reference.startswith("#SW-")
    assert sale.status == "Completed"
    assert float(sale.amount_total) == 10 * 15.0 + 40 * 14.5

    coke = db.query(Product).filter(Product.sku == "C-1").one()
    assert coke.stock == 90  # 100 - 10
    pepsi = db.query(Product).filter(Product.name == "Pepsi").one()
    assert pepsi.stock == 0  # created with exactly-covering stock, then sold
    assert pepsi.category == "Other"  # bad guess → Other, not garbage

    # Income counted EXACTLY once: placeholder retired, order owns the money.
    live = db.query(LedgerEntry).filter(
        LedgerEntry.business_id == business.id, LedgerEntry.direction == "in",
        LedgerEntry.is_deleted == False).all()  # noqa: E712
    assert len(live) == 1
    assert float(live[0].amount) == float(sale.amount_total)
    assert live[0].order_id == sale.id


def test_sweep_is_idempotent_and_skips_empty(client, db, user, business):
    from app.models import Order
    _sheet_entry(db, user, business)
    make_entry(db, user, party="Blank", amount=0, direction="in",
               business_id=business.id, source="sales_sheet", line_items=[])
    assert client.post("/api/v1/shop/sweep-sales").json()["swept"] == 1
    second = client.post("/api/v1/shop/sweep-sales").json()
    assert (second["swept"], second["skipped"]) == (0, 1)
    assert db.query(Order).count() == 1


def test_new_sales_sheet_creates_order_directly(client, db, user, business, seed_categories):
    from app.main import app as _app
    from app.models import LedgerEntry, Order, Product
    from app.routers import ingest

    def sheet(*a, **k):
        return {
            "kind": "sales_sheet", "direction": "in", "amount": 150.0,
            "currency": "ZMW", "party": None, "occurred_on": "2026-09-10",
            "category": None, "context_hint": "business", "reference": None,
            "line_items": [{"name": "Bread", "quantity": 10, "unit_price": 15.0,
                            "category_guess": "meals"}],
            "confidence": "high", "needs_question": None,
        }

    _app.dependency_overrides[ingest.get_classifier] = lambda: {"image": sheet, "text": sheet}
    try:
        r = client.post("/api/v1/ingest/text", json={"text": "tally"})
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)

    assert r.status_code == 201, r.text
    assert r.json()["entry"]["order_ref"].startswith("#SW-")
    assert db.query(Order).count() == 1
    assert db.query(Product).filter(Product.name == "Bread").one().stock == 0
    assert "cost price" in (r.json()["entry"]["note"] or "")
    # One money row, not two.
    assert db.query(LedgerEntry).count() == 1


def test_sales_sheet_without_shop_asks_for_shop(client, db, user, seed_categories):
    from app.main import app as _app
    from app.routers import ingest

    def sheet(*a, **k):
        return {"kind": "sales_sheet", "direction": "in", "amount": 150.0,
                "currency": "ZMW", "party": None, "occurred_on": None,
                "category": None, "context_hint": "business", "reference": None,
                "line_items": [{"name": "Bread", "quantity": 1, "unit_price": 15.0}],
                "confidence": "high", "needs_question": None}

    _app.dependency_overrides[ingest.get_classifier] = lambda: {"image": sheet, "text": sheet}
    try:
        r = client.post("/api/v1/ingest/text", json={"text": "tally"})
    finally:
        _app.dependency_overrides.pop(ingest.get_classifier, None)

    assert r.status_code == 200
    assert "shop" in (r.json()["message"] or "").lower()
    assert r.json()["entry"] is None
