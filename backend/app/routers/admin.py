"""Solo-admin API.

Users list, set plan, claim list/review; confirming a claim sets the
plan — guarded by the shared-secret X-Admin-Key, fail-closed when
unconfigured. No admin UI — the founder works these three endpoints
with curl or Postman, prompted by Telegram pings. Returns plain dicts
(there's no schemas module here on purpose — the API is small enough
that a pydantic model per endpoint would be more ceremony than value).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import LedgerEntry, PaymentRequest, Profile

router = APIRouter(
    prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)]
)

VALID_PLANS = {"free", "pro", "business"}


class PlanUpdate(BaseModel):
    plan: str  # free | pro | business


class PaymentRequestReview(BaseModel):
    action: str  # confirm | reject
    review_note: str | None = None


def _admin_request_out(pr: PaymentRequest, email: str | None) -> dict:
    return {
        "id": pr.id,
        "user_id": pr.user_id,
        "user_email": email or "unknown",
        "plan_requested": pr.plan_requested,
        "amount": float(pr.amount),
        "currency": pr.currency,
        "momo_network": pr.momo_network,
        "momo_reference": pr.momo_reference,
        "momo_sender_number": pr.momo_sender_number,
        "status": pr.status,
        "reviewed_at": pr.reviewed_at.isoformat() if pr.reviewed_at else None,
        "review_note": pr.review_note,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
    }


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    rows = (
        db.query(Profile, func.count(LedgerEntry.id).label("entry_count"))
        .outerjoin(
            LedgerEntry,
            (LedgerEntry.user_id == Profile.id) & (LedgerEntry.is_deleted.is_(False)),
        )
        .group_by(Profile.id)
        .all()
    )
    return [
        {
            "id": profile.id,
            "email": profile.email,
            "plan": profile.plan,
            "entry_count": count,
        }
        for profile, count in rows
    ]


@router.patch("/users/{user_id}/plan")
def set_user_plan(user_id: str, payload: PlanUpdate, db: Session = Depends(get_db)):
    if payload.plan not in VALID_PLANS:
        raise HTTPException(400, f"Plan must be one of {sorted(VALID_PLANS)}")

    profile = db.get(Profile, user_id)
    if profile is None:
        raise HTTPException(404, "User not found")

    profile.plan = payload.plan
    db.commit()
    db.refresh(profile)

    entry_count = (
        db.query(func.count(LedgerEntry.id))
        .filter(LedgerEntry.user_id == profile.id, LedgerEntry.is_deleted.is_(False))
        .scalar()
    )
    return {
        "id": profile.id,
        "email": profile.email,
        "plan": profile.plan,
        "entry_count": entry_count,
    }


@router.get("/payment-requests")
def list_payment_requests(status: str | None = None, db: Session = Depends(get_db)):
    query = db.query(PaymentRequest, Profile).outerjoin(
        Profile, PaymentRequest.user_id == Profile.id
    )
    if status:
        query = query.filter(PaymentRequest.status == status)
    rows = query.order_by(PaymentRequest.created_at.desc()).all()
    return [_admin_request_out(pr, profile.email if profile else None) for pr, profile in rows]


@router.patch("/payment-requests/{request_id}")
def review_payment_request(
    request_id: str, payload: PaymentRequestReview, db: Session = Depends(get_db)
):
    if payload.action not in {"confirm", "reject"}:
        raise HTTPException(400, "action must be 'confirm' or 'reject'")

    pr = db.get(PaymentRequest, request_id)
    if pr is None:
        raise HTTPException(404, "Payment request not found")
    if pr.status != "pending":
        raise HTTPException(400, f"Already reviewed ({pr.status})")

    pr.status = "confirmed" if payload.action == "confirm" else "rejected"
    pr.reviewed_at = datetime.utcnow()
    pr.review_note = (payload.review_note or "").strip() or None

    profile = db.get(Profile, pr.user_id)
    if profile is None:
        profile = Profile(id=pr.user_id, plan="free")
        db.add(profile)
    if payload.action == "confirm":
        profile.plan = pr.plan_requested

    db.commit()
    db.refresh(pr)
    return _admin_request_out(pr, profile.email)
