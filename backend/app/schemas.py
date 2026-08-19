from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    plan: str
    currency: str
    created_at: datetime


class ReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant: Optional[str]
    purchase_date: Optional[date]
    total_amount: Optional[float]
    tax_amount: Optional[float]
    currency: str
    status: str
    confidence: Optional[str]
    image_path: Optional[str]
    thumbnail_path: Optional[str]
    category_id: Optional[str] = None
    created_at: datetime


class ReceiptUpdate(BaseModel):
    merchant: Optional[str] = None
    purchase_date: Optional[date] = None
    total_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    currency: Optional[str] = None
    category_id: Optional[str] = None


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    plan: str
    created_at: datetime
    receipt_count: int = 0


class PlanUpdate(BaseModel):
    plan: str  # free | pro | business


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    period_start: Optional[date]
    period_end: Optional[date]
    total_amount: Optional[float]
    receipt_count: int
    created_at: datetime
