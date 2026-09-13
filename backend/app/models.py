import uuid
from datetime import datetime, date

from sqlalchemy import Column, String, Numeric, Integer, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


def gen_id():
    return str(uuid.uuid4())


class PersonalReceipt(Base):
    __tablename__ = "personal_receipts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_id)
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    merchant = Column(String, nullable=True)
    amount = Column(Numeric, nullable=True)
    currency = Column(String, default="ZMW")
    category = Column(String, nullable=True)
    purchase_date = Column(Date, nullable=True)
    image_url = Column(String, nullable=True)
    status = Column(String, default="processed")
    created_at = Column(DateTime, default=datetime.utcnow)


class ShopProduct(Base):
    __tablename__ = "shop_products"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_id)
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    name = Column(String, nullable=False)
    sku = Column(String, nullable=True)
    price = Column(Numeric, default=0)
    cost = Column(Numeric, default=0)
    stock = Column(Integer, default=0)
    image_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ShopSale(Base):
    __tablename__ = "shop_sales"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_id)
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=False), ForeignKey("shop_products.id"), nullable=True)
    product_name = Column(String, nullable=True)
    quantity = Column(Integer, default=1)
    unit_price = Column(Numeric, default=0)
    total = Column(Numeric, default=0)
    sold_at = Column(DateTime, default=datetime.utcnow)
