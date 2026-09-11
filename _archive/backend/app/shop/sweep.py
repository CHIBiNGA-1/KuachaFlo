"""Sweeps Phase-2-window sales sheets into real orders.

Between Phase 2 and Phase 3, sales sheets landed as business income
ledger entries (source=sales_sheet) with line_items preserved and stock
untouched. This converts each into a real Completed sale — matching or
creating products exactly like the old KraTte whatsapp-import did — and
retires the placeholder entry so income never double-counts.

Idempotent: swept entries are soft-deleted, so reruns skip them.
Runs from the shop migration script; new sales sheets post-Phase-3 go
straight through order creation in ingestion (no sweep needed).
"""

import random
import re
import string

from sqlalchemy.orm import Session

from app.models import LedgerEntry, Product
from app.shop import orders, validate as v


def _normalize(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "item"
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))
    return f"{base}-{suffix}"


def match_or_create_products(db: Session, business, line_items: list) -> tuple[list, list[str]]:
    """Matches sheet lines to products (case-insensitive), auto-creating
    misses with price=cost=unit price and exactly-covering stock — the
    old KraTte whatsapp-import semantics. Returns (order_lines, created_names)."""
    by_name = {
        _normalize(p.name): p
        for p in db.query(Product).filter(Product.business_id == business.id).all()
    }
    order_lines: list[dict] = []
    created: list[str] = []
    for raw in line_items or []:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()[:500]
        if not name:
            continue
        try:
            quantity = max(1, min(100000, int(raw.get("quantity") or 1)))
            unit_price = max(0.0, float(raw.get("unit_price") or 0))
        except (TypeError, ValueError):
            continue

        product = by_name.get(_normalize(name))
        if product is None:
            guess = raw.get("category_guess")
            category = guess if guess in v.INVENTORY_CATEGORIES else "Other"
            sku = _slugify(name)
            product = Product(
                business_id=business.id, name=name,
                sku=sku, sku_normalized=sku.strip().lower(),
                category=category, price=unit_price, cost=unit_price,
                stock=quantity, reorder_at=0,
                notes="Auto-created from a sales sheet — check the cost price.",
            )
            db.add(product)
            db.flush()
            by_name[_normalize(name)] = product
            created.append(name)
        order_lines.append({"product_id": product.id, "quantity": quantity})
    return order_lines, created


def sweep_sales_sheets(db: Session, user, business) -> dict:
    """Converts unswept sales_sheet entries for this business. Returns a report."""
    rows = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.business_id == business.id,
                LedgerEntry.source == "sales_sheet",
                LedgerEntry.order_id.is_(None),
                LedgerEntry.is_deleted == False)  # noqa: E712
        .order_by(LedgerEntry.created_at)
        .all()
    )

    swept = skipped = 0
    created_products: list[str] = []
    for entry in rows:
        order_lines, created = match_or_create_products(db, business, entry.line_items)
        created_products.extend(created)
        if not order_lines:
            skipped += 1
            continue

        sale = orders.create_order(db, user, business, "sale", {
            "items": order_lines, "status": "Completed",
            "customer": entry.party or "Walk-in",
            "date": entry.occurred_on.isoformat() if entry.occurred_on else None,
            "notes": f"From sales sheet {entry.created_at.date().isoformat() if entry.created_at else ''}".strip(),
        })
        # Retire the placeholder: the sale owns the money now.
        entry.is_deleted = True
        entry.order_id = sale.id
        db.flush()
        swept += 1

    db.commit()
    return {"swept": swept, "skipped": skipped, "created_products": created_products}
