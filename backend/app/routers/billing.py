"""MoMo-claim billing.

No gateway: the user pays via Airtel/MTN MoMo off-app, submits the
transaction reference, and the founder verifies it in the MoMo app and
confirms via the admin API (which sets the plan). One plan per user —
these routes take any signed-in user, and the claim get-or-creates the
profile row (stamping the token email so the founder can tell claims
apart).
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.limiter import limiter
from app.models import PaymentRequest, Profile
from app.telegram import notify_admin

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

VALID_PLANS = {"pro", "business"}
VALID_NETWORKS = {"airtel", "mtn"}

# The price a client claims to be paying is never trusted — it's computed
# here from plan_requested. Keep in sync with frontend/components/account/
# BillingSheet.tsx's PLANS constant; a mismatch is a display bug, not a
# billing bug, since this table is what actually gets stored and reviewed.
PLAN_PRICES = {"pro": 150.0, "business": 450.0}


class PaymentRequestCreate(BaseModel):
    plan_requested: str
    # Accepted for backwards compatibility with older frontend builds that
    # still send it, but never trusted — see PLAN_PRICES above. Optional so
    # a client can drop the field entirely going forward.
    amount: float | None = None
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
@limiter.limit("5/hour")
def submit_payment_request(
    request: Request,
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

    # Canonical price for the plan, never whatever the client sent — a
    # tampered amount would otherwise look legitimate to the admin
    # reviewing it (see finding #1 of the security review).
    amount = PLAN_PRICES[payload.plan_requested]

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
        amount=amount,
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
        f"{amount} {payload.currency} via {payload.momo_network.upper()}\n"
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
