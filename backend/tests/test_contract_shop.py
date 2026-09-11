"""Contract tests for the shop API (blueprint §7 + §8).

Ports of KraTte's invariants (store.ts / validation.ts), now served by
the one FastAPI backend. Red until Phase 3.
"""

import uuid


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


def test_products_crud_and_tabs(client, business):
    p = _product(client)
    assert p["name"] == "Coca-Cola 500ml"
    assert p["version"] == 1

    got = client.get("/api/v1/shop/products").json()
    assert got["items"] and got["items"][0]["sku"] == p["sku"]

    low = _product(client, name="Pepsi", stock=2, reorder_at=10)
    out = _product(client, name="Fanta", stock=0)
    assert client.get("/api/v1/shop/products?tab=low").json()["items"][0]["id"] == low["id"]
    assert {i["id"] for i in client.get("/api/v1/shop/products?tab=out").json()["items"]} == {out["id"]}

    upd = client.patch(f"/api/v1/shop/products/{p['id']}",
                       json={"price": 16.0, "expected_version": 1})
    assert upd.status_code == 200, upd.text
    assert upd.json()["price"] == 16.0
    assert upd.json()["version"] == 2


def test_product_sku_unique_per_business_case_insensitive(client, business):
    _product(client, sku="ABC-1")
    r = client.post("/api/v1/shop/products", json={
        "name": "Other", "sku": "  abc-1 ", "category": "Beverages",
        "price": 1, "cost": 1, "stock": 0,
    })
    assert r.status_code == 409


def test_product_edit_version_conflict(client, business):
    p = _product(client)
    client.patch(f"/api/v1/shop/products/{p['id']}", json={"price": 99, "expected_version": 1})
    r = client.patch(f"/api/v1/shop/products/{p['id']}", json={"price": 5, "expected_version": 1})
    assert r.status_code == 409
    assert r.json()["code"] == "VERSION_CONFLICT"


def test_sale_computes_total_decrements_stock_writes_ledger(client, db, business):
    coke = _product(client, price=15.0, cost=11.0, stock=100)
    pepsi = _product(client, name="Pepsi", price=14.0, cost=10.0, stock=50)

    r = client.post("/api/v1/shop/sales", json={
        "items": [
            {"product_id": coke["id"], "quantity": 3},
            {"product_id": pepsi["id"], "quantity": 2},
        ],
        "status": "Completed", "customer": "Walk-in",
    })
    assert r.status_code == 201, r.text
    sale = r.json()
    assert sale["reference"].startswith("#SW-")
    # Client totals are ignored — server computes: 3*15 + 2*14 = 73.
    assert sale["amount_total"] == 73.0

    items = {i["product_id"]: i for i in sale["items"]}
    assert items[coke["id"]]["price"] == 15.0
    assert items[coke["id"]]["cost"] == 11.0

    inv = {i["id"]: i for i in client.get("/api/v1/shop/products").json()["items"]}
    assert inv[coke["id"]]["stock"] == 97
    assert inv[pepsi["id"]]["stock"] == 48

    # The money side exists in the one ledger.
    ledger = client.get("/api/v1/ledger?context=business").json()["items"]
    assert any(e["direction"] == "in" and e["amount"] == 73.0
               and e["order_ref"] == sale["reference"] for e in ledger)


def test_sale_rejects_negative_stock(client, business):
    p = _product(client, stock=2)
    r = client.post("/api/v1/shop/sales", json={
        "items": [{"product_id": p["id"], "quantity": 5}], "status": "Completed",
    })
    assert r.status_code == 422, r.text
    assert "stock" in r.json()["error"].lower()


def test_pending_sale_moves_no_stock_until_completed(client, business):
    p = _product(client, stock=10)
    sale = client.post("/api/v1/shop/sales", json={
        "items": [{"product_id": p["id"], "quantity": 4}], "status": "Pending",
    }).json()
    inv = client.get("/api/v1/shop/products").json()["items"][0]
    assert inv["stock"] == 10

    client.patch(f"/api/v1/shop/sales/{sale['id']}", json={"status": "Completed"})
    inv = client.get("/api/v1/shop/products").json()["items"][0]
    assert inv["stock"] == 6


def test_cancel_sale_reverses_stock_keeps_history(client, business):
    p = _product(client, stock=10)
    sale = client.post("/api/v1/shop/sales", json={
        "items": [{"product_id": p["id"], "quantity": 4}], "status": "Completed",
    }).json()
    r = client.post(f"/api/v1/shop/sales/{sale['id']}/cancel")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Cancelled"
    assert client.get("/api/v1/shop/products").json()["items"][0]["stock"] == 10
    # History is sacred — the order row still exists.
    assert client.get("/api/v1/shop/sales").json()["items"]


def test_idempotent_replay_returns_fresh_not_stale(client, business):
    p = _product(client, stock=10)
    key = str(uuid.uuid4())
    body = {"items": [{"product_id": p["id"], "quantity": 1}], "status": "Completed"}
    first = client.post("/api/v1/shop/sales", json=body, headers={"Idempotency-Key": key})
    assert first.status_code == 201
    second = client.post("/api/v1/shop/sales", json=body, headers={"Idempotency-Key": key})
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    # Stock moved exactly once.
    assert client.get("/api/v1/shop/products").json()["items"][0]["stock"] == 9

    # Same key, DIFFERENT body → conflict, not silent apply.
    third = client.post("/api/v1/shop/sales",
                        json={"items": [{"product_id": p["id"], "quantity": 9}], "status": "Completed"},
                        headers={"Idempotency-Key": key})
    assert third.status_code == 409


def test_product_delete_blocked_with_history(client, business):
    p = _product(client, stock=10)
    client.post("/api/v1/shop/sales", json={
        "items": [{"product_id": p["id"], "quantity": 1}], "status": "Completed",
    })
    r = client.delete(f"/api/v1/shop/products/{p['id']}")
    assert r.status_code == 409
    # ...but archiving works and hides it from pickers.
    assert client.post(f"/api/v1/shop/products/{p['id']}/archive").status_code == 200
    assert client.get("/api/v1/shop/products").json()["items"] == []


def test_purchase_received_increments_stock(client, business):
    p = _product(client, stock=5, cost=10.0)
    po = client.post("/api/v1/shop/purchases", json={
        "items": [{"product_id": p["id"], "quantity": 20}],
        "status": "Ordered", "supplier": "Zambeef",
    }).json()
    assert po["reference"].startswith("#PO-")
    assert client.get("/api/v1/shop/products").json()["items"][0]["stock"] == 5

    client.patch(f"/api/v1/shop/purchases/{po['id']}", json={"status": "Received"})
    assert client.get("/api/v1/shop/products").json()["items"][0]["stock"] == 25

    ledger = client.get("/api/v1/ledger?context=business").json()["items"]
    assert any(e["direction"] == "out" and e["order_ref"] == po["reference"] for e in ledger)


def test_shop_requires_business(client, db, user):
    # No business row for this user → shop endpoints explain, not 500.
    r = client.post("/api/v1/shop/products", json={
        "name": "X", "sku": "x", "category": "Beverages", "price": 1, "cost": 1, "stock": 0,
    })
    assert r.status_code in (403, 404)


def test_shop_overview(client, business):
    _product(client, name="Low", stock=2, reorder_at=10)
    _product(client, name="Fine", stock=50)
    o = client.get("/api/v1/shop/overview").json()
    assert o["low_stock"] and o["low_stock"][0]["name"] == "Low"
    assert o["out_of_stock_count"] == 0
    assert "today_sales" in o and "week_sales" in o


def test_parties_crud(client, business):
    c = client.post("/api/v1/shop/customers", json={
        "name": "Chileshe", "email": "c@example.com", "channel": "Retail",
    })
    assert c.status_code == 201, c.text
    s = client.post("/api/v1/shop/suppliers", json={
        "name": "Zambeef", "contact_person": "Mutinta",
        "email": "orders@zambeef.example", "status": "Active",
    })
    assert s.status_code == 201, s.text
    t = client.post("/api/v1/shop/team", json={
        "name": "Bwalya", "email": "b@example.com", "role": "Manager", "status": "Active",
    })
    assert t.status_code == 201, t.text
