from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, PaymentRequest
from app.schemas import PaymentRequestCreate, PaymentRequestOut
from app.telegram import notify_admin

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

VALID_PLANS = {"pro", "business"}
VALID_NETWORKS = {"airtel", "mtn"}


@router.post("/payment-request", response_model=PaymentRequestOut)
def submit_payment_request(
    payload: PaymentRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.plan_requested not in VALID_PLANS:
        raise HTTPException(400, f"plan_requested must be one of {sorted(VALID_PLANS)}")
    if payload.momo_network not in VALID_NETWORKS:
        raise HTTPException(400, f"momo_network must be one of {sorted(VALID_NETWORKS)}")
    if not payload.momo_reference.strip():
        raise HTTPException(400, "momo_reference is required")

    request = PaymentRequest(
        user_id=user.id,
        plan_requested=payload.plan_requested,
        amount=payload.amount,
        currency=payload.currency,
        momo_network=payload.momo_network,
        momo_reference=payload.momo_reference.strip(),
        momo_sender_number=payload.momo_sender_number,
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    notify_admin(
        f"💰 New payment claim\n"
        f"*{user.email}* wants *{payload.plan_requested}*\n"
        f"{payload.amount} {payload.currency} via {payload.momo_network.upper()}\n"
        f"Ref: `{payload.momo_reference}`\n"
        f"Review: your admin dashboard → Payment Requests"
    )

    return request


@router.get("/payment-requests", response_model=list[PaymentRequestOut])
def list_my_payment_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(PaymentRequest)
        .filter(PaymentRequest.user_id == user.id)
        .order_by(PaymentRequest.created_at.desc())
        .all()
    )
