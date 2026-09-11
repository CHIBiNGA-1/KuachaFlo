import uuid
from datetime import datetime, date

from sqlalchemy import (
    Column, String, Numeric, Date, DateTime, Boolean, ForeignKey, Text, Integer, JSON
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    supabase_uid = Column(String, unique=True, nullable=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    currency = Column(String, default="USD")
    plan = Column(String, default="free")  # free | pro | business
    created_at = Column(DateTime, default=datetime.utcnow)

    # WhatsApp receipt capture — links a WhatsApp number to this account.
    # whatsapp_number is the source of truth once linked; the link_code
    # fields are only populated transiently during the linking flow.
    whatsapp_number = Column(String, unique=True, nullable=True, index=True)
    whatsapp_link_code = Column(String, nullable=True)
    whatsapp_link_code_expires = Column(DateTime, nullable=True)

    receipts = relationship("Receipt", back_populates="user", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True)
    icon = Column(String, nullable=True)
    is_default = Column(Boolean, default=True)

    # Which worlds this category is valid in — the classifier's enum and
    # the context-flip remap both filter on this. Any subset of
    # ["personal", "shop", "expense"]. See docs/BUILD_LOG.md (frozen v1
    # taxonomy); the seed in app.database is the source of truth.
    kinds = Column(JSON, nullable=True)


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)

    image_path = Column(String, nullable=True)      # served via /uploads/...
    thumbnail_path = Column(String, nullable=True)

    merchant = Column(String, nullable=True)
    purchase_date = Column(Date, nullable=True)
    total_amount = Column(Numeric(12, 2), nullable=True)
    tax_amount = Column(Numeric(12, 2), nullable=True)
    currency = Column(String, default="USD")
    raw_ocr_text = Column(Text, nullable=True)

    status = Column(String, default="processed")  # processed | failed | needs_review
    confidence = Column(String, nullable=True)     # high | medium | low

    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Where this entry came from — lets the UI show "via WhatsApp" etc.,
    # and matters functionally too: whatsapp_momo_sms entries have no
    # image at all (they're built from forwarded SMS text, not a photo).
    source = Column(String, default="app")  # app | whatsapp_photo | whatsapp_momo_sms

    # --- Ledger unification: this table is becoming the shared
    # money-movement ledger for both personal and business entries, not
    # just "receipts". Both columns are additive and default to today's
    # meaning of every existing row: money going out, no business
    # attached. Nothing reads these yet — this is the foundation, not
    # the feature. ---
    direction = Column(String, default="out", nullable=False)  # out | in
    business_id = Column(String, ForeignKey("businesses.id"), nullable=True, index=True)
    line_items = Column(JSON, nullable=True)  # multi-item entries (e.g. a sales-sheet photo)

    user = relationship("User", back_populates="receipts")


class LedgerEntry(Base):
    """
    THE spine: every money movement in the unified product is one row
    here — a photographed receipt, a forwarded MoMo alert, a shop sale's
    income side, a purchase's spend side, a manual entry. Context is
    DERIVED (business_id null → personal), never stored twice.

    Receipt rows are backfilled into this table (see app/ledger_backfill)
    and the receipts table lives on only as a shadow during migration.
    """
    __tablename__ = "ledger_entries"

    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    business_id = Column(String, ForeignKey("businesses.id"), nullable=True, index=True)

    direction = Column(String, nullable=False, default="out")  # out | in
    amount = Column(Numeric(12, 2), nullable=True)
    currency = Column(String, default="ZMW")

    party = Column(String, nullable=True)  # merchant / counterparty / customer
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    occurred_on = Column(Date, nullable=True, index=True)
    note = Column(Text, nullable=True)

    # app_manual | app_photo | whatsapp_photo | whatsapp_momo_text |
    # whatsapp_momo_image | sales_sheet | shop_manual | shop_order |
    # shop_import | legacy_receipt
    source = Column(String, default="app_manual")

    image_path = Column(String, nullable=True)
    thumbnail_path = Column(String, nullable=True)

    # Full model output for audit/debug — never shown raw to users.
    raw_extraction = Column(JSON, nullable=True)

    status = Column(String, default="processed")  # processed | needs_review
    confidence = Column(String, nullable=True)     # high | medium | low

    # Set when this entry IS a sale/purchase's money side. Plain string
    # until Phase 3 creates the orders table — then it becomes a real FK.
    order_id = Column(String, nullable=True, index=True)
    line_items = Column(JSON, nullable=True)

    # Which learned rule filed this (for "why filed here" explanations).
    memory_id = Column(String, ForeignKey("memories.id"), nullable=True)

    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Memory(Base):
    """
    The nerves: what the product learned from corrections and answered
    questions. Keyed per user: "merchant:<normalized>" for named parties,
    "counterparty:<normalized>" for phone-like ones. Ingestion consults
    this before asking the user anything — a hit means file silently.
    """
    __tablename__ = "memories"

    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    key = Column(String, nullable=False, index=True)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    context = Column(String, nullable=True)  # personal | business
    party_display = Column(String, nullable=True)
    hits = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WhatsAppPendingClarification(Base):
    """
    A thin input's draft, waiting on one question's answer. Drafts NEVER
    become entries on their own — they commit on reply, die on cancel, or
    expire silently. No ghost money, ever.
    """
    __tablename__ = "whatsapp_pending_clarifications"

    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    chat_sender = Column(String, nullable=True)  # WhatsApp number, or "app" for in-app drafts
    draft_entry = Column(JSON, nullable=False)
    question = Column(String, nullable=False)
    attempts = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Business(Base):
    """
    A shop/business a user runs — the KraTte side of one identity. Kept
    deliberately separate from the ledger: inventory, staff, customers,
    and suppliers are business *resources*, not money movements, so they
    don't belong in the same table as receipts/sales/purchases. A
    business's ledger entries are the LedgerEntry rows where business_id
    points here.
    """
    __tablename__ = "businesses"

    id = Column(String, primary_key=True, default=gen_id)
    owner_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False, default="My Shop")
    currency = Column(String, default="USD")
    created_at = Column(DateTime, default=datetime.utcnow)


class WhatsAppProcessedMessage(Base):
    """
    Dedup guard for the webhook. Meta retries a webhook delivery if it
    doesn't get a fast 200 back — without this, a slow Gemini call means
    the same WhatsApp message gets processed 2-3x and the same receipt
    gets logged multiple times. message_id is the primary key on purpose:
    the very first thing the webhook does is try to insert it, before any
    Gemini/DB work happens, so even overlapping retries get blocked
    immediately rather than racing each other.
    """
    __tablename__ = "whatsapp_processed_messages"

    message_id = Column(String, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PaymentRequest(Base):
    """
    A user's claim to have paid via MoMo, pending manual verification.
    No payment gateway involved — the operator checks the MoMo app for a
    matching transaction and approves/rejects from the admin dashboard.
    """
    __tablename__ = "payment_requests"

    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    plan_requested = Column(String, nullable=False)     # pro | business
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, default="ZMW")
    momo_network = Column(String, nullable=False)        # airtel | mtn
    momo_reference = Column(String, nullable=False)      # user-entered transaction id
    momo_sender_number = Column(String, nullable=True)   # number the payment was sent from

    status = Column(String, default="pending")            # pending | confirmed | rejected
    reviewed_at = Column(DateTime, nullable=True)
    review_note = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    # Combined is the hero (the thing no fragmented tool can produce).
    scope = Column(String, default="personal")  # combined | personal | business
    business_id = Column(String, ForeignKey("businesses.id"), nullable=True, index=True)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    pdf_path = Column(String, nullable=False)  # filesystem path, not web-servable
    total_amount = Column(Numeric(12, 2), nullable=True)
    receipt_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
