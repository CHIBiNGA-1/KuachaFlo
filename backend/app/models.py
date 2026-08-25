import uuid
from datetime import datetime, date

from sqlalchemy import (
    Column, String, Numeric, Date, DateTime, Boolean, ForeignKey, Text, Integer
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

    user = relationship("User", back_populates="receipts")


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
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    pdf_path = Column(String, nullable=False)  # filesystem path, not web-servable
    total_amount = Column(Numeric(12, 2), nullable=True)
    receipt_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
