"""Product CRUD + guards (port of the inventory branch of mutateRecord)."""

from sqlalchemy.orm import Session

from app.models import OrderItem, Product, Supplier
from app.shop import validate as v
from app.shop.errors import Conflict, NotFound, ShopError

ALLOWED = {
    "name", "sku", "category", "price", "cost", "stock", "reorder_at",
    "unit", "supplier_id", "supplier", "image", "notes", "pinned",
    "expected_version", "expected_stock",
}


def serialize(p: Product) -> dict:
    return {
        "id": p.id, "name": p.name, "sku": p.sku, "category": p.category,
        "price": float(p.price or 0), "cost": float(p.cost or 0),
        "stock": p.stock, "reorder_at": p.reorder_at, "unit": p.unit,
        "supplier_id": p.supplier_id, "image": p.image or "",
        "notes": p.notes or "", "pinned": bool(p.pinned),
        "archived": bool(p.archived), "version": p.version,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _normalize_sku(sku: str) -> str:
    return sku.strip().lower()


def get_owned(db: Session, business_id: str, product_id: str) -> Product:
    v.uuid_value(product_id, "Product")
    row = (
        db.query(Product)
        .filter(Product.id == product_id, Product.business_id == business_id)
        .first()
    )
    if row is None:
        raise NotFound("This product no longer exists.")
    return row


def list_products(db: Session, business_id: str, *, tab="all", q=None, limit=200) -> dict:
    query = db.query(Product).filter(
        Product.business_id == business_id, Product.archived.is_(False)
    )
    if q:
        like = f"%{q.strip()}%"
        query = query.filter((Product.name.ilike(like)) | (Product.sku.ilike(like)))
    rows = query.order_by(Product.name).limit(limit + 1).all()

    if tab == "out":
        rows = [r for r in rows if (r.stock or 0) == 0]
    elif tab == "low":
        rows = [r for r in rows if 0 < (r.stock or 0) <= (r.reorder_at or 0)]
    elif tab == "in":
        rows = [r for r in rows if (r.stock or 0) > (r.reorder_at or 0)]
    elif tab != "all":
        raise ShopError("Unknown tab.")
    return {"items": [serialize(r) for r in rows[:limit]], "next_cursor": None}


def create_product(db: Session, business_id: str, payload: dict) -> Product:
    v.allowed_keys(payload, sorted(ALLOWED))
    name = v.text(payload.get("name"), "Product name", min_len=1, max_len=500, required=True)
    sku = v.text(payload.get("sku"), "SKU", min_len=1, max_len=500, required=True)
    category = v.choice(payload.get("category"), v.INVENTORY_CATEGORIES, "Category")
    price = v.money(payload.get("price"), "Selling price")
    cost = v.money(payload.get("cost"), "Cost price")
    stock = v.whole(payload.get("stock", 0), "Stock on hand", min_value=0)
    reorder_at = v.whole(payload.get("reorder_at", 20), "Low-stock threshold", min_value=0)
    unit = v.text(payload.get("unit"), "Size / unit", max_len=100)
    notes = v.text(payload.get("notes"), "Notes", max_len=2000)
    image = v.product_image(payload.get("image") or "")
    pinned = payload.get("pinned", False)
    if not isinstance(pinned, bool):
        raise ShopError("Saved-product preference must be true or false.")

    supplier_id = payload.get("supplier_id") or None
    if supplier_id is not None:
        v.uuid_value(supplier_id, "Supplier")
        exists = (
            db.query(Supplier)
            .filter(Supplier.id == supplier_id, Supplier.business_id == business_id)
            .first()
        )
        if exists is None:
            raise ShopError("Choose a valid supplier.")

    normalized = _normalize_sku(sku)
    dup = (
        db.query(Product)
        .filter(Product.business_id == business_id, Product.sku_normalized == normalized)
        .first()
    )
    if dup is not None:
        raise Conflict("A product with this SKU already exists.", code="SKU_TAKEN")

    row = Product(
        business_id=business_id, sku=sku.strip(), sku_normalized=normalized,
        name=name, category=category, price=price, cost=cost, stock=stock,
        reorder_at=reorder_at, unit=unit or None, supplier_id=supplier_id,
        image=image or None, notes=notes or None, pinned=pinned,
    )
    db.add(row)
    db.flush()
    return row


def update_product(db: Session, business_id: str, product_id: str, payload: dict) -> Product:
    v.allowed_keys(payload, sorted(ALLOWED))
    row = get_owned(db, business_id, product_id)

    if payload.get("expected_version") is not None:
        v.whole(payload["expected_version"], "Expected version", min_value=1, max_value=2147483647)
        if row.version != payload["expected_version"]:
            raise Conflict(
                "This product changed while you were editing. Reload its details before saving.",
                code="VERSION_CONFLICT",
            )
    if payload.get("expected_stock") is not None:
        v.whole(payload["expected_stock"], "Expected stock", min_value=0)
        if (row.stock or 0) != payload["expected_stock"]:
            raise Conflict(
                "Stock changed while this card was open. Close and reopen Quick edit to use the latest count.",
                code="STOCK_CHANGED",
            )

    if "name" in payload:
        row.name = v.text(payload["name"], "Product name", min_len=1, max_len=500, required=True)
    if "sku" in payload:
        sku = v.text(payload["sku"], "SKU", min_len=1, max_len=500, required=True)
        normalized = _normalize_sku(sku)
        dup = (
            db.query(Product)
            .filter(Product.business_id == business_id,
                    Product.sku_normalized == normalized, Product.id != row.id)
            .first()
        )
        if dup is not None:
            raise Conflict("A product with this SKU already exists.", code="SKU_TAKEN")
        row.sku, row.sku_normalized = sku.strip(), normalized
    if "category" in payload:
        row.category = v.choice(payload["category"], v.INVENTORY_CATEGORIES, "Category")
    if "price" in payload:
        row.price = v.money(payload["price"], "Selling price")
    if "cost" in payload:
        row.cost = v.money(payload["cost"], "Cost price")
    if "stock" in payload:
        row.stock = v.whole(payload["stock"], "Stock on hand", min_value=0)
    if "reorder_at" in payload:
        row.reorder_at = v.whole(payload["reorder_at"], "Low-stock threshold", min_value=0)
    if "unit" in payload:
        row.unit = v.text(payload["unit"], "Size / unit", max_len=100) or None
    if "notes" in payload:
        row.notes = v.text(payload["notes"], "Notes", max_len=2000) or None
    if "image" in payload:
        row.image = v.product_image(payload["image"] or "") or None
    if "pinned" in payload:
        if not isinstance(payload["pinned"], bool):
            raise ShopError("Saved-product preference must be true or false.")
        row.pinned = payload["pinned"]
    if "supplier_id" in payload:
        supplier_id = payload["supplier_id"] or None
        if supplier_id is not None:
            v.uuid_value(supplier_id, "Supplier")
            exists = (
                db.query(Supplier)
                .filter(Supplier.id == supplier_id, Supplier.business_id == business_id)
                .first()
            )
            if exists is None:
                raise ShopError("Choose a valid supplier.")
        row.supplier_id = supplier_id

    row.version = (row.version or 1) + 1
    db.flush()
    return row


def delete_product(db: Session, business_id: str, product_id: str) -> None:
    row = get_owned(db, business_id, product_id)
    linked = (
        db.query(OrderItem.id).filter(OrderItem.product_id == row.id).limit(1).first()
    )
    if linked is not None:
        raise Conflict(
            "This product is linked to order history. Keep it for your records, "
            "or archive it to hide it from pickers.",
            code="LINKED_HISTORY",
        )
    db.delete(row)
    db.flush()


def set_archived(db: Session, business_id: str, product_id: str, archived: bool) -> Product:
    row = get_owned(db, business_id, product_id)
    row.archived = archived
    row.version = (row.version or 1) + 1
    db.flush()
    return row