"""MoMo-claim billing.

No gateway: the user pays via Airtel/MTN MoMo off-app, submits the
transaction reference, and the founder verifies it in the MoMo app and
confirms via the admin API (which sets the plan). One plan per user —
these routes take any signed-in user, and the claim get-or-creates the
profile row (stamping the token email so the founder can tell claims
apart).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import PaymentRequest, Profile
from app.telegram import notify_admin

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

VALID_PLANS = {"pro", "business"}
VALID_NETWORKS = {"airtel", "mtn"}


class PaymentRequestCreate(BaseModel):
    plan_requested: str
    amount: float
    currency: str = "ZMW"
    momo_network: str
    momo_reference: str
    momo_sender_number: str | None = None


def _out(row: PaymentRequest) -> dict:
    return {
        "id": row.id,
        "plan_requested": row.plan_requested,
        "amount": float(row.amount),
        "currency": row.currency,
        "momo_network": row.momo_network,
        "momo_reference": row.momo_reference,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.post("/payment-request")
def submit_payment_request(
    payload: PaymentRequestCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.plan_requested not in VALID_PLANS:
        raise HTTPException(400, f"plan_requested must be one of {sorted(VALID_PLANS)}")
    if payload.momo_network not in VALID_NETWORKS:
        raise HTTPException(400, f"momo_network must be one of {sorted(VALID_NETWORKS)}")
    if not payload.momo_reference.strip():
        raise HTTPException(400, "momo_reference is required")

    profile = db.get(Profile, user["id"])
    if profile is None:
        profile = Profile(id=user["id"], plan="free")
        db.add(profile)
    if user.get("email") and not profile.email:
        profile.email = user["email"]
    db.commit()

    request = PaymentRequest(
        user_id=user["id"],
        plan_requested=payload.plan_requested,
        amount=payload.amount,
        currency=payload.currency,
        momo_network=payload.momo_network,
        momo_reference=payload.momo_reference.strip(),
        momo_sender_number=(payload.momo_sender_number or "").strip() or None,
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    notify_admin(
        f"New payment claim\n"
        f"*{user.get('email') or user['id']}* wants *{payload.plan_requested}*\n"
        f"{payload.amount} {payload.currency} via {payload.momo_network.upper()}\n"
        f"Ref: `{payload.momo_reference.strip()}`\n"
        f"Review: `PATCH /api/v1/admin/payment-requests/{request.id}`"
    )

    return _out(request)


@router.get("/payment-requests")
def list_my_payment_requests(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PaymentRequest)
        .filter(PaymentRequest.user_id == user["id"])
        .order_by(PaymentRequest.created_at.desc())
        .all()
    )
    return [_out(r) for r in rows]
