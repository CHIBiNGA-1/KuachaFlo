"""ORM models over the Postgres tables (see supabase/schema.sql and
supabase/shop.sql for the real DDL, FKs, and RLS). No relationships here —
the API reads and writes rows directly; Postgres owns the constraints.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, JSON, Numeric, String, Text, UniqueConstraint

from app.db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _uuid4() -> str:
    """Dashed UUIDs — app.shop.validate.uuid_value requires the dashed form."""
    return str(uuid.uuid4())


class Profile(Base):
    """One row per signed-in account. Every account is a shop account —
    there's no mode to pick."""

    __tablename__ = "profiles"

    id = Column(String, primary_key=True)
    plan = Column(String, nullable=False, default="free")
    email = Column(String, nullable=True)
    # whatsapp_number is the source of truth once linked; the link_code
    # columns are only alive for the 15 minutes a code is valid.
    whatsapp_number = Column(String, nullable=True, unique=True, index=True)
    whatsapp_link_code = Column(String, nullable=True)
    whatsapp_link_code_expires = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class LedgerEntry(Base):
    """The shared money-movement ledger. Every shop order/expense that
    touches money writes one row here (business_id set); it's the table
    admin reporting and billing counters read from."""

    __tablename__ = "ledger_entries"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, nullable=False, index=True)
    business_id = Column(String, nullable=True, index=True)
    direction = Column(String, nullable=False, default="out")
    amount = Column(Numeric(14, 2), nullable=False)
    currency = Column(String, nullable=False, default="ZMW")
    party = Column(String, nullable=True)
    category = Column(String, nullable=True)
    occurred_on = Column(Date, nullable=False)
    note = Column(Text, nullable=True)
    source = Column(String, nullable=False, default="manual")
    status = Column(String, nullable=False, default="processed")
    confidence = Column(String, nullable=True)
    image_path = Column(Text, nullable=True)
    raw = Column(JSON, nullable=True)
    line_items = Column(JSON, nullable=True)  # sales-sheet lines awaiting the sweep
    order_id = Column(String, nullable=True)  # set on shop-order money entries
    is_deleted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Category(Base):
    __tablename__ = "categories"

    slug = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=True)


class PaymentRequest(Base):
    """A manual MoMo payment claim. No gateway involved — the founder checks
    the MoMo app for a matching transaction and confirms/rejects via the
    admin API (confirming sets the plan)."""

    __tablename__ = "payment_requests"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, nullable=False, index=True)
    plan_requested = Column(String, nullable=False)  # pro | business
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, nullable=False, default="ZMW")
    momo_network = Column(String, nullable=False)  # airtel | mtn
    momo_reference = Column(String, nullable=False)
    momo_sender_number = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | confirmed | rejected
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class WhatsAppProcessedMessage(Base):
    """Dedup guard for the webhook. Meta retries a delivery it doesn't get
    a fast 200 for — without this, a slow classify call logs the same
    sales-sheet 2-3 times. message_id is the PK on purpose: the webhook
    inserts it BEFORE any processing, so overlapping retries die at the
    claim rather than racing each other."""

    __tablename__ = "whatsapp_processed_messages"

    message_id = Column(String, primary_key=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Business(Base):
    """One shop-account's shop. Inventory, staff, customers, and suppliers
    hang off here; its money is the LedgerEntry rows whose business_id
    points here."""

    __tablename__ = "businesses"

    id = Column(String, primary_key=True, default=_uuid4)
    owner_user_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False, default="My Shop")
    currency = Column(String, nullable=False, default="ZMW")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Product(Base):
    """Shop inventory. Money lives in the ledger; this is what's on the shelf."""

    __tablename__ = "products"

    id = Column(String, primary_key=True, default=_uuid4)
    business_id = Column(String, nullable=False, index=True)
    sku = Column(String, nullable=False)
    sku_normalized = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, default="Other")
    price = Column(Numeric(12, 2), nullable=False, default=0)
    cost = Column(Numeric(12, 2), nullable=False, default=0)
    stock = Column(Integer, nullable=False, default=0)
    reorder_at = Column(Integer, nullable=False, default=0)
    unit = Column(String, nullable=True)
    supplier_id = Column(String, nullable=True)
    image = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    pinned = Column(Boolean, nullable=False, default=False)
    archived = Column(Boolean, nullable=False, default=False)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Order(Base):
    """Sales + purchases in one table (kind discriminates). Totals are
    server-computed; the money side is a linked ledger entry."""

    __tablename__ = "orders"

    id = Column(String, primary_key=True, default=_uuid4)
    business_id = Column(String, nullable=False, index=True)
    kind = Column(String, nullable=False)  # sale | purchase
    reference = Column(String, nullable=False)  # #SW-N | #PO-N, unique per (business, kind)
    party_name = Column(String, nullable=False, default="")
    party_id = Column(String, nullable=True)
    status = Column(String, nullable=False)
    channel = Column(String, nullable=False, default="Retail")
    payment = Column(String, nullable=False, default="Paid")
    occurred_on = Column(Date, nullable=True)
    due_on = Column(Date, nullable=True)
    notes = Column(String, nullable=True)
    amount_total = Column(Numeric(12, 2), nullable=False, default=0)
    ledger_entry_id = Column(String, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String, primary_key=True, default=_uuid4)
    order_id = Column(String, nullable=False, index=True)
    product_id = Column(String, nullable=False, index=True)
    name_snapshot = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    price_snapshot = Column(Numeric(12, 2), nullable=False)
    cost_snapshot = Column(Numeric(12, 2), nullable=False)


class Customer(Base):
    __tablename__ = "customers"

    id = Column(String, primary_key=True, default=_uuid4)
    business_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    company = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    channel = Column(String, nullable=False, default="Retail")
    balance_opening = Column(Numeric(12, 2), nullable=False, default=0)
    address = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(String, primary_key=True, default=_uuid4)
    business_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    contact_person = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    category = Column(String, nullable=True)
    status = Column(String, nullable=False, default="Active")
    address = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class TeamMember(Base):
    """Staff directory only — no separate logins."""

    __tablename__ = "team_members"

    id = Column(String, primary_key=True, default=_uuid4)
    business_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    role = Column(String, nullable=False, default="")
    status = Column(String, nullable=False, default="Active")
    phone = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class OrderSequence(Base):
    """Per-business #SW/#PO counters."""

    __tablename__ = "order_sequences"

    business_id = Column(String, primary_key=True)
    kind = Column(String, primary_key=True)  # sale | purchase
    value = Column(Integer, nullable=False)


class ShopIdempotencyKey(Base):
    """Idempotency-Key store."""

    __tablename__ = "shop_idempotency_keys"

    business_id = Column(String, primary_key=True)
    key = Column(String, primary_key=True)
    fingerprint = Column(String, nullable=False)
    response = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ShopAuditEvent(Base):
    """Money/stock audit trail."""

    __tablename__ = "shop_audit_events"

    id = Column(String, primary_key=True, default=_uuid4)
    business_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False)
    action = Column(String, nullable=False)
    resource = Column(String, nullable=False)
    record_id = Column(String, nullable=True)
    request_id = Column(String, nullable=False)
    event_metadata = Column("metadata", JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
