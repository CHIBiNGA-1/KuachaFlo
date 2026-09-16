"""Sales + purchases (port of the order branches of mutateRecord).

Same invariants, same messages' intent:
- References allocated per-business (#SW-N / #PO-N), never client-set.
- Totals computed server-side in minor units; client totals ignored.
- Line prices snapshot at creation and survive edits (editing quantity
  never silently reprices history).
- Stock moves ONLY on terminal states (Completed / Received), as deltas
  (old reversed, new applied) — status flips and item edits stay exact.
- Stock never goes negative; violations are 422s with human sentences.
- Every terminal order has exactly one money-side ledger entry; leaving
  terminal (cancel/downgrade) soft-deletes it. The order row is forever.

Note: `user` is the auth dict ({"id", "email"}), not an ORM row.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import LedgerEntry, Order, OrderItem, Product
from app.shop import validate as v
from app.shop.errors import Conflict, NotFound, ShopError
from app.shop.money import money_value, order_amount
from app.shop.sequences import next_reference

ALLOWED = {
    "name", "customer", "supplier", "customer_id", "supplier_id", "status",
    "channel", "payment", "date", "due_date", "dueDate", "notes", "items",
    "amount", "expected_version",
}

TERMINAL = {"sale": "Completed", "purchase": "Received"}


def _lock(query, db: Session):
    bind = db.get_bind()
    if bind is not None and bind.dialect.name != "sqlite":
        return query.with_for_update()
    return query  # SQLite: single-writer anyway; PG gets real row locks


def serialize(order: Order, items: list[OrderItem]) -> dict:
    return {
        "id": order.id, "kind": order.kind, "reference": order.reference,
        "party_name": order.party_name, "party_id": order.party_id,
        "status": order.status, "channel": order.channel, "payment": order.payment,
        "occurred_on": order.occurred_on.isoformat() if order.occurred_on else None,
        "due_on": order.due_on.isoformat() if order.due_on else None,
        "notes": order.notes or "",
        "items": [
            {"product_id": i.product_id, "name": i.name_snapshot,
             "quantity": i.quantity, "price": float(i.price_snapshot),
             "cost": float(i.cost_snapshot)}
            for i in items
        ],
        "amount_total": float(order.amount_total or 0),
        "version": order.version,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


def get_owned(db: Session, business_id: str, kind: str, order_id: str) -> Order:
    v.uuid_value(order_id, "Order")
    row = (
        db.query(Order)
        .filter(Order.id == order_id, Order.business_id == business_id, Order.kind == kind)
        .first()
    )
    if row is None:
        raise NotFound("This order no longer exists.")
    return row


def _items_of(db: Session, order_id: str) -> list[OrderItem]:
    return db.query(OrderItem).filter(OrderItem.order_id == order_id).all()


def list_orders(db: Session, business_id: str, kind: str, *, status=None, limit=200) -> dict:
    query = (
        db.query(Order)
        .filter(Order.business_id == business_id, Order.kind == kind)
        .order_by(Order.created_at.desc(), Order.id.desc())
    )
    if status:
        query = query.filter(Order.status == status)
    rows = query.limit(limit + 1).all()
    out = []
    for o in rows[:limit]:
        out.append(serialize(o, _items_of(db, o.id)))
    return {"items": out, "next_cursor": None}


def _validate_items(payload_items, label="items") -> list[dict]:
    if not isinstance(payload_items, list) or not payload_items or len(payload_items) > 100:
        raise ShopError("Add between 1 and 100 products to this order.")
    cleaned = []
    for raw in payload_items:
        if not isinstance(raw, dict):
            raise ShopError("Order items must be objects.")
        v.allowed_keys(raw, ["product_id", "quantity", "name", "price", "cost"])
        cleaned.append({
            "product_id": v.uuid_value(raw.get("product_id"), "Product"),
            "quantity": v.whole(raw.get("quantity"), "Quantity", min_value=1, max_value=100000),
        })
    return cleaned


def _resolve_products(db: Session, business_id: str, product_ids: list[str]) -> dict:
    rows = _lock(
        db.query(Product).filter(
            Product.business_id == business_id, Product.id.in_(product_ids)),
        db,
    ).all()
    found = {p.id: p for p in rows}
    missing = [i for i in product_ids if i not in found]
    if missing:
        raise ShopError("One of the selected products is no longer available.")
    return found


def _build_lines(kind: str, cleaned: list[dict], products: dict,
                 previous: list[OrderItem]) -> list[dict]:
    prev = {i.product_id: i for i in previous}
    combined: dict[str, dict] = {}
    for item in cleaned:
        product = products[item["product_id"]]
        old = prev.get(item["product_id"])
        quantity = item["quantity"] + (combined.get(item["product_id"], {}).get("quantity", 0))
        if quantity > 100000:
            raise ShopError("An order cannot contain more than 100,000 units of one product.")
        default_price = float(product.price or 0) if kind == "sale" else float(product.cost or 0)
        combined[item["product_id"]] = {
            "product_id": item["product_id"],
            "name": product.name,
            "quantity": quantity,
            "price": money_value(
                float(old.price_snapshot) if old else default_price, "Unit price"),
            "cost": money_value(
                float(old.cost_snapshot) if old else float(product.cost or 0), "Unit cost"),
        }
    return list(combined.values())


def _delta_for(kind: str, status: str | None, lines, multiplier: int) -> dict[str, int]:
    if status != TERMINAL[kind]:
        return {}
    sign = -1 if kind == "sale" else 1
    deltas: dict[str, int] = {}
    for line in lines:
        pid = line["product_id"] if isinstance(line, dict) else line.product_id
        qty = line["quantity"] if isinstance(line, dict) else line.quantity
        deltas[pid] = deltas.get(pid, 0) + qty * multiplier * sign
    return deltas


def _apply_deltas(db: Session, business_id: str, deltas: dict[str, int]) -> list[Product]:
    changed = []
    for pid, delta in deltas.items():
        if not delta:
            continue
        product = _resolve_products(db, business_id, [pid])[pid]
        before = product.stock or 0
        after = before + delta
        if after < 0:
            raise ShopError(
                f"Not enough stock for {product.name}. {before} units available. "
                "Adjust the quantity or order status."
            )
        v.whole(after, "Resulting stock", min_value=0)
        product.stock = after
        product.version = (product.version or 1) + 1
        changed.append(product)
    db.flush()
    return changed


def _sync_money_entry(db: Session, user: dict, business, order: Order, lines_total: float) -> None:
    """Terminal → exactly one money-side ledger entry. Non-terminal →
    the money entry (if any) is soft-deleted: money never moved."""
    terminal = order.status == TERMINAL[order.kind]
    existing = None
    if order.ledger_entry_id:
        existing = (
            db.query(LedgerEntry).filter(LedgerEntry.id == order.ledger_entry_id).first()
        )

    if not terminal:
        if existing is not None and not existing.is_deleted:
            existing.is_deleted = True
        db.flush()
        return

    direction = "in" if order.kind == "sale" else "out"
    if existing is None:
        entry = LedgerEntry(
            user_id=user["id"], business_id=business.id, direction=direction,
            amount=lines_total, currency=business.currency or "ZMW",
            party=order.party_name or ("Walk-in" if order.kind == "sale" else "Supplier"),
            occurred_on=order.occurred_on or datetime.utcnow().date(),
            source="shop_order", status="processed", confidence="high",
            order_id=order.id,
        )
        db.add(entry)
        db.flush()
        order.ledger_entry_id = entry.id
    else:
        existing.is_deleted = False
        existing.direction = direction
        existing.amount = lines_total
        existing.party = order.party_name
        existing.occurred_on = order.occurred_on or existing.occurred_on
    db.flush()


def create_order(db: Session, user: dict, business, kind: str, payload: dict) -> Order:
    v.allowed_keys(payload, sorted(ALLOWED))
    statuses = v.SALE_STATUSES if kind == "sale" else v.PURCHASE_STATUSES
    status = v.choice(payload.get("status"), statuses, "Order status")
    party_key = "customer" if kind == "sale" else "supplier"
    party_name = v.text(
        payload.get(party_key) if payload.get(party_key) else ("Walk-in customer" if kind == "sale" else ""),
        "Customer" if kind == "sale" else "Supplier", min_len=1, max_len=200, required=True,
    )
    channel = v.choice(payload.get("channel"), v.CHANNELS, "Sales channel", fallback="Retail")
    payment = v.choice(payload.get("payment"), v.PAYMENTS, "Payment status", fallback="Paid")
    occurred = v.date_value(payload.get("date") or datetime.utcnow().date().isoformat())
    due = v.date_value(payload["due_date"] or payload["dueDate"]) if (payload.get("due_date") or payload.get("dueDate")) else None
    notes = v.text(payload.get("notes"), "Notes", max_len=2000)
    cleaned = _validate_items(payload.get("items"))

    products = _resolve_products(db, business.id, sorted({i["product_id"] for i in cleaned}))
    lines = _build_lines(kind, cleaned, products, [])
    total = order_amount([{"quantity": ln["quantity"], "price": ln["price"]} for ln in lines])

    deltas = _delta_for(kind, status, lines, 1)
    _apply_deltas(db, business.id, deltas)

    order = Order(
        business_id=business.id, kind=kind,
        reference=next_reference(db, business.id, kind),
        party_name=party_name, status=status, channel=channel, payment=payment,
        occurred_on=occurred, due_on=due, notes=notes or None, amount_total=total,
    )
    db.add(order)
    db.flush()
    for ln in lines:
        db.add(OrderItem(
            order_id=order.id, product_id=ln["product_id"], name_snapshot=ln["name"],
            quantity=ln["quantity"], price_snapshot=ln["price"], cost_snapshot=ln["cost"],
        ))
    db.flush()
    _sync_money_entry(db, user, business, order, total)
    return order


def update_order(db: Session, user: dict, business, kind: str, order_id: str, payload: dict) -> Order:
    v.allowed_keys(payload, sorted(ALLOWED))
    order = get_owned(db, business.id, kind, order_id)
    previous_status = order.status  # snapshot before any mutation below

    if payload.get("expected_version") is not None:
        v.whole(payload["expected_version"], "Expected version", min_value=1, max_value=2147483647)
        if order.version != payload["expected_version"]:
            raise Conflict(
                "This order changed while you were editing. Reload its details before saving.",
                code="VERSION_CONFLICT",
            )

    statuses = v.SALE_STATUSES if kind == "sale" else v.PURCHASE_STATUSES
    if "status" in payload:
        order.status = v.choice(payload["status"], statuses, "Order status")
    party_key = "customer" if kind == "sale" else "supplier"
    if party_key in payload:
        order.party_name = v.text(
            payload[party_key], "Customer" if kind == "sale" else "Supplier",
            min_len=1, max_len=200, required=True)
    if "channel" in payload:
        order.channel = v.choice(payload["channel"], v.CHANNELS, "Sales channel", fallback="Retail")
    if "payment" in payload:
        order.payment = v.choice(payload["payment"], v.PAYMENTS, "Payment status", fallback="Paid")
    if "date" in payload:
        order.occurred_on = v.date_value(payload["date"])
    if "due_date" in payload or "dueDate" in payload:
        raw = payload.get("due_date") if payload.get("due_date") is not None else payload.get("dueDate")
        order.due_on = v.date_value(raw, "Expected delivery date") if raw else None
    if "notes" in payload:
        order.notes = v.text(payload["notes"], "Notes", max_len=2000) or None

    old_items = _items_of(db, order.id)
    if "items" in payload:
        cleaned = _validate_items(payload["items"])
        all_ids = sorted({i.product_id for i in old_items} | {i["product_id"] for i in cleaned})
        products = _resolve_products(db, business.id, all_ids)
        lines = _build_lines(kind, cleaned, products, old_items)
        db.query(OrderItem).filter(OrderItem.order_id == order.id).delete()
        for ln in lines:
            db.add(OrderItem(
                order_id=order.id, product_id=ln["product_id"], name_snapshot=ln["name"],
                quantity=ln["quantity"], price_snapshot=ln["price"], cost_snapshot=ln["cost"],
            ))
        db.flush()
    else:
        lines = [
            {"product_id": i.product_id, "quantity": i.quantity, "price": float(i.price_snapshot)}
            for i in old_items
        ]
        all_ids = sorted({i.product_id for i in old_items})
        if all_ids:
            _resolve_products(db, business.id, all_ids)  # lock for the delta write

    # Reverse-then-apply: old state out, new state in. Exactly one net move.
    deltas: dict[str, int] = {}
    for pid, d in _delta_for(kind, previous_status, old_items, -1).items():
        deltas[pid] = deltas.get(pid, 0) + d
    for pid, d in _delta_for(kind, order.status, lines, 1).items():
        deltas[pid] = deltas.get(pid, 0) + d
    _apply_deltas(db, business.id, deltas)

    total = order_amount([{"quantity": ln["quantity"], "price": ln["price"]} for ln in lines])
    order.amount_total = total
    order.version = (order.version or 1) + 1
    db.flush()
    _sync_money_entry(db, user, business, order, total)
    return order


def cancel_order(db: Session, user: dict, business, kind: str, order_id: str) -> Order:
    order = get_owned(db, business.id, kind, order_id)
    if order.status == "Cancelled":
        return order  # idempotent — cancelling twice is not an error
    old_items = _items_of(db, order.id)
    if old_items:
        _resolve_products(db, business.id, sorted({i.product_id for i in old_items}))
    deltas = _delta_for(kind, order.status, old_items, -1)
    _apply_deltas(db, business.id, deltas)
    order.status = "Cancelled"
    order.version = (order.version or 1) + 1
    db.flush()
    _sync_money_entry(db, user, business, order, float(order.amount_total or 0))
    return order