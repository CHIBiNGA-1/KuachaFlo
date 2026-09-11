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
    whatsapp_number: Optional[str] = None


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    currency: str
    created_at: datetime


class BusinessExpenseCreate(BaseModel):
    party: str  # who was paid — kept generic since this is the shared
    # ledger shape, not a receipts-only concept
    amount: float
    currency: Optional[str] = None
    category: Optional[str] = None
    date: Optional[date] = None
    note: Optional[str] = None


class BusinessLedgerEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    direction: str
    merchant: Optional[str]
    total_amount: Optional[float]
    currency: str
    purchase_date: Optional[date]
    source: str
    line_items: Optional[list] = None
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


class PaymentRequestCreate(BaseModel):
    plan_requested: str          # pro | business
    amount: float
    currency: str = "ZMW"
    momo_network: str            # airtel | mtn
    momo_reference: str
    momo_sender_number: Optional[str] = None


class PaymentRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    plan_requested: str
    amount: float
    currency: str
    momo_network: str
    momo_reference: str
    status: str
    created_at: datetime


class PaymentRequestAdminOut(PaymentRequestOut):
    user_id: str
    user_email: str
    momo_sender_number: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None


class PaymentRequestReview(BaseModel):
    action: str          # confirm | reject
    review_note: Optional[str] = None


class WhatsAppLinkCodeOut(BaseModel):
    code: str
    expires_in_minutes: int
    whatsapp_number: str
    already_linked: bool


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    period_start: Optional[date]
    period_end: Optional[date]
    total_amount: Optional[float]
    receipt_count: int
    created_at: datetime
