"""Shop API: products, sales, purchases, parties, expenses, overview.

Every signed-in account has exactly one shop. The business row is
auto-provisioned on first touch (name "My Shop", ZMW), so there is no
setup gate and no dead-end. Sweep (tally-sheet conversion) returns with
the capture-sync slice, not here.
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Business, Customer, Order, OrderItem, Product, Profile, Supplier, TeamMember
from app.shop import expenses, idempotency, orders, parties, products, validate as v
from app.shop.sweep import sweep_sales_sheets
from app.shop.audit import record as audit_record
from app.shop.errors import ShopError

router = APIRouter(prefix="/api/v1/shop", tags=["shop"])


def _require_shop(db: Session, user: dict) -> Business:
    """Every signed-in account has exactly one shop. It's auto-provisioned
    on first touch (name "My Shop", ZMW) — no setup gate, no dead-end."""
    profile = db.get(Profile, user["id"])
    if profile is None:
        profile = Profile(id=user["id"], email=user.get("email"), plan="free")
        db.add(profile)
        db.commit()
    business = db.query(Business).filter(Business.owner_user_id == user["id"]).first()
    if business is None:
        business = Business(owner_user_id=user["id"], name="My Shop", currency="ZMW")
        db.add(business)
        db.commit()
        db.refresh(business)
    return business


def _check_key(key: str | None) -> None:
    if key is not None and not v.UUID_RE.match(key):
        raise ShopError("Invalid Idempotency-Key.", status=422, code="BAD_IDEMPOTENCY_KEY")


def _run(db: Session, fn, *args, **kwargs):
    """Runs a service call with clean rollback on domain errors."""
    try:
        result = fn(*args, **kwargs)
        db.commit()
        return result
    except ShopError:
        db.rollback()
        raise


def _audit(db: Session, user: dict, business: Business, action: str,
           resource: str, record_id: str | None, metadata: dict | None = None) -> None:
    audit_record(db, business_id=business.id, user_id=user["id"],
                 request_id=uuid.uuid4().hex, action=action,
                 resource=resource, record_id=record_id, metadata=metadata or {})
    db.commit()


# ── products ───────────────────────────────────────────────────────────

@router.get("/products")
def get_products(
    tab: str = Query("all"), q: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    return products.list_products(db, business.id, tab=tab, q=q, limit=limit)


@router.post("/products", status_code=201)
def create_product(
    payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    business = _require_shop(db, user)
    _check_key(idempotency_key)
    replay = idempotency.check_replay(db, business.id, idempotency_key, "products", payload)
    if replay is not None:
        row = products.get_owned(db, business.id, replay["id"])
        return products.serialize(row)
    try:
        row = products.create_product(db, business.id, payload)
        idempotency.remember(db, business.id, idempotency_key, "products", payload,
                             {"type": "product", "id": row.id})
        db.commit()
    except ShopError:
        db.rollback()
        raise
    _audit(db, user, business, "record.created", "inventory", row.id, {"version": row.version})
    return products.serialize(row)


@router.patch("/products/{product_id}")
def update_product(
    product_id: str, payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, products.update_product, db, business.id, product_id, payload)
    _audit(db, user, business, "record.updated", "inventory", row.id,
           {"fields": sorted(payload.keys()), "version": row.version})
    return products.serialize(row)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(
    product_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    _run(db, products.delete_product, db, business.id, product_id)
    _audit(db, user, business, "record.deleted", "inventory", product_id)
    return None


@router.post("/products/{product_id}/archive")
def archive_product(
    product_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, products.set_archived, db, business.id, product_id, True)
    return products.serialize(row)


@router.post("/products/{product_id}/unarchive")
def unarchive_product(
    product_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, products.set_archived, db, business.id, product_id, False)
    return products.serialize(row)


# ── orders (sales + purchases share everything but the kind) ────────────

def _create_order(db, user, kind: str, payload: dict, key: str | None):
    business = _require_shop(db, user)
    _check_key(key)
    resource = "sales" if kind == "sale" else "purchases"
    replay = idempotency.check_replay(db, business.id, key, resource, payload)
    if replay is not None:
        order = orders.get_owned(db, business.id, kind, replay["id"])
        return orders.serialize(order, orders._items_of(db, order.id)), True
    try:
        order = orders.create_order(db, user, business, kind, payload)
        idempotency.remember(db, business.id, key, resource, payload,
                             {"type": kind, "id": order.id})
        db.commit()
    except ShopError:
        db.rollback()
        raise
    _audit(db, user, business, "record.created", resource, order.id,
           {"reference": order.reference, "total": float(order.amount_total or 0)})
    fresh = orders.get_owned(db, business.id, kind, order.id)
    return orders.serialize(fresh, orders._items_of(db, fresh.id)), False


@router.get("/sales")
def get_sales(
    status: Optional[str] = Query(None), limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    return orders.list_orders(db, business.id, "sale", status=status, limit=limit)


@router.post("/sales", status_code=201)
def create_sale(
    payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    body, _ = _create_order(db, user, "sale", payload, idempotency_key)
    return body


@router.patch("/sales/{order_id}")
def update_sale(
    order_id: str, payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    order = _run(db, orders.update_order, db, user, business, "sale", order_id, payload)
    _audit(db, user, business, "record.updated", "sales", order.id,
           {"fields": sorted(payload.keys()), "version": order.version})
    fresh = orders.get_owned(db, business.id, "sale", order.id)
    return orders.serialize(fresh, orders._items_of(db, fresh.id))


@router.post("/sales/{order_id}/cancel")
def cancel_sale(
    order_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    order = _run(db, orders.cancel_order, db, user, business, "sale", order_id)
    _audit(db, user, business, "record.cancelled", "sales", order.id)
    fresh = orders.get_owned(db, business.id, "sale", order.id)
    return orders.serialize(fresh, orders._items_of(db, fresh.id))


@router.get("/purchases")
def get_purchases(
    status: Optional[str] = Query(None), limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    return orders.list_orders(db, business.id, "purchase", status=status, limit=limit)


@router.post("/purchases", status_code=201)
def create_purchase(
    payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    body, _ = _create_order(db, user, "purchase", payload, idempotency_key)
    return body


@router.patch("/purchases/{order_id}")
def update_purchase(
    order_id: str, payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    order = _run(db, orders.update_order, db, user, business, "purchase", order_id, payload)
    _audit(db, user, business, "record.updated", "purchases", order.id,
           {"fields": sorted(payload.keys()), "version": order.version})
    fresh = orders.get_owned(db, business.id, "purchase", order.id)
    return orders.serialize(fresh, orders._items_of(db, fresh.id))


@router.post("/purchases/{order_id}/cancel")
def cancel_purchase(
    order_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    order = _run(db, orders.cancel_order, db, user, business, "purchase", order_id)
    _audit(db, user, business, "record.cancelled", "purchases", order.id)
    fresh = orders.get_owned(db, business.id, "purchase", order.id)
    return orders.serialize(fresh, orders._items_of(db, fresh.id))


# ── parties ────────────────────────────────────────────────────────────

@router.get("/customers")
def get_customers(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    business = _require_shop(db, user)
    return parties.list_rows(db, Customer, business.id, parties.serialize_customer)


@router.post("/customers", status_code=201)
def create_customer(
    payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, parties.create_customer, db, business.id, payload)
    return parties.serialize_customer(row)


@router.patch("/customers/{record_id}")
def update_customer(
    record_id: str, payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, parties.update_customer, db, business.id, record_id, payload)
    return parties.serialize_customer(row)


@router.delete("/customers/{record_id}", status_code=204)
def delete_customer(
    record_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    _run(db, parties.delete_row, db, Customer, business.id, record_id, "Customer")
    return None


@router.get("/suppliers")
def get_suppliers(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    business = _require_shop(db, user)
    return parties.list_rows(db, Supplier, business.id, parties.serialize_supplier)


@router.post("/suppliers", status_code=201)
def create_supplier(
    payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, parties.create_supplier, db, business.id, payload)
    return parties.serialize_supplier(row)


@router.patch("/suppliers/{record_id}")
def update_supplier(
    record_id: str, payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, parties.update_supplier, db, business.id, record_id, payload)
    return parties.serialize_supplier(row)


@router.delete("/suppliers/{record_id}", status_code=204)
def delete_supplier(
    record_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    _run(db, parties.delete_row, db, Supplier, business.id, record_id, "Supplier")
    return None


@router.get("/team")
def get_team(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    business = _require_shop(db, user)
    return parties.list_rows(db, TeamMember, business.id, parties.serialize_team)


@router.post("/team", status_code=201)
def create_team_member(
    payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, parties.create_team_member, db, business.id, payload)
    return parties.serialize_team(row)


@router.patch("/team/{record_id}")
def update_team_member(
    record_id: str, payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, parties.update_team_member, db, business.id, record_id, payload)
    return parties.serialize_team(row)


@router.delete("/team/{record_id}", status_code=204)
def delete_team_member(
    record_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    _run(db, parties.delete_row, db, TeamMember, business.id, record_id, "Team member")
    return None


# ── expenses (money out that isn't stock) ──────────────────────────────

@router.get("/expenses")
def get_expenses(
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    return expenses.list_expenses(db, business.id, limit=limit)


@router.post("/expenses", status_code=201)
def create_expense(
    payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    business = _require_shop(db, user)
    _check_key(idempotency_key)
    replay = idempotency.check_replay(db, business.id, idempotency_key, "expenses", payload)
    if replay is not None:
        return expenses.serialize(expenses.get_owned(db, business.id, replay["id"]))
    try:
        row = expenses.create_expense(db, user, business, payload)
        idempotency.remember(db, business.id, idempotency_key, "expenses", payload,
                             {"type": "expense", "id": row.id})
        db.commit()
    except ShopError:
        db.rollback()
        raise
    _audit(db, user, business, "record.created", "expenses", row.id,
           {"amount": float(row.amount or 0)})
    return expenses.serialize(row)


@router.patch("/expenses/{expense_id}")
def update_expense(
    expense_id: str, payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    row = _run(db, expenses.update_expense, db, business.id, expense_id, payload)
    _audit(db, user, business, "record.updated", "expenses", row.id,
           {"fields": sorted(payload.keys())})
    return expenses.serialize(row)


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    _run(db, expenses.delete_expense, db, business.id, expense_id)
    _audit(db, user, business, "record.deleted", "expenses", expense_id)
    return None


# ── business ───────────────────────────────────────────────────────────

@router.get("/business")
def get_business(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    business = _require_shop(db, user)
    return {"id": business.id, "name": business.name, "currency": business.currency}


@router.patch("/business")
def update_business(
    payload: dict = Body(...),
    db: Session = Depends(get_db), user: dict = Depends(get_current_user),
):
    business = _require_shop(db, user)
    v.allowed_keys(payload, ["name"])
    business.name = v.text(payload.get("name"), "Shop name",
                           min_len=1, max_len=120, required=True)
    db.commit()
    db.refresh(business)
    _audit(db, user, business, "record.updated", "business", business.id, {"fields": ["name"]})
    return {"id": business.id, "name": business.name, "currency": business.currency}


# ── overview ───────────────────────────────────────────────────────────

@router.get("/overview")
def get_overview(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    business = _require_shop(db, user)
    today = datetime.utcnow().date()
    week_ago = today - timedelta(days=6)

    stocked = (
        db.query(Product).filter(Product.business_id == business.id,
                                 Product.archived.is_(False))
        .all()
    )
    low = sorted(
        [p for p in stocked if 0 < (p.stock or 0) <= (p.reorder_at or 0)],
        key=lambda p: (p.stock or 0),
    )
    out_count = sum(1 for p in stocked if (p.stock or 0) == 0)

    def _sales_sum(since):
        return float(
            db.query(func.coalesce(func.sum(Order.amount_total), 0)).filter(
                Order.business_id == business.id, Order.kind == "sale",
                Order.status == "Completed", Order.occurred_on >= since,
            ).scalar() or 0
        )

    pending = (
        db.query(func.count(Order.id)).filter(
            Order.business_id == business.id,
            ((Order.kind == "sale") & (Order.status == "Pending")) |
            ((Order.kind == "purchase") & (Order.status == "Ordered")),
        ).scalar()
    )

    top = (
        db.query(OrderItem.name_snapshot, func.sum(OrderItem.quantity).label("qty"))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.business_id == business.id, Order.kind == "sale",
                Order.status == "Completed",
                Order.occurred_on >= today - timedelta(days=30))
        .group_by(OrderItem.name_snapshot)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
        .all()
    )

    return {
        "low_stock": [products.serialize(p) for p in low[:10]],
        "out_of_stock_count": out_count,
        "today_sales": _sales_sum(today),
        "week_sales": _sales_sum(week_ago),
        "pending_orders": pending,
        "top_products": [{"name": name, "quantity": int(qty)} for name, qty in top],
    }


# ── sweep ──────────────────────────────────────────────────────────────

@router.post("/sweep-sales")
def sweep_sales(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Converts leftover sales_sheet placeholders into real Completed
    sales (see app/shop/sweep.py). Idempotent — reruns sweep nothing new."""
    business = _require_shop(db, user)
    report = _run(db, sweep_sales_sheets, db, user, business)
    _audit(db, user, business, "record.swept", "sales", None, report)
    return report