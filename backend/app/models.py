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

    user = relationship("User", back_populates="receipts")


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
