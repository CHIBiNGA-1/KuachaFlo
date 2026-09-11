from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import User, Receipt, PaymentRequest
from app.schemas import AdminUserOut, PlanUpdate, PaymentRequestAdminOut, PaymentRequestReview

router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])

VALID_PLANS = {"free", "pro", "business"}


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)):
    rows = (
        db.query(User, func.count(Receipt.id).label("receipt_count"))
        .outerjoin(Receipt, (Receipt.user_id == User.id) & (Receipt.is_deleted == False))  # noqa: E712
        .group_by(User.id)
        .order_by(User.created_at.desc())
        .all()
    )
    return [
        AdminUserOut(
            id=user.id,
            email=user.email,
            plan=user.plan,
            created_at=user.created_at,
            receipt_count=count,
        )
        for user, count in rows
    ]


@router.patch("/users/{user_id}/plan", response_model=AdminUserOut)
def set_user_plan(user_id: str, payload: PlanUpdate, db: Session = Depends(get_db)):
    if payload.plan not in VALID_PLANS:
        raise HTTPException(400, f"Plan must be one of {sorted(VALID_PLANS)}")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(404, "User not found")

    user.plan = payload.plan
    db.commit()
    db.refresh(user)

    receipt_count = (
        db.query(func.count(Receipt.id))
        .filter(Receipt.user_id == user.id, Receipt.is_deleted == False)  # noqa: E712
        .scalar()
    )

    return AdminUserOut(
        id=user.id, email=user.email, plan=user.plan,
        created_at=user.created_at, receipt_count=receipt_count,
    )


@router.get("/payment-requests", response_model=list[PaymentRequestAdminOut])
def list_payment_requests(status: str | None = None, db: Session = Depends(get_db)):
    query = db.query(PaymentRequest, User).join(User, PaymentRequest.user_id == User.id)
    if status:
        query = query.filter(PaymentRequest.status == status)
    rows = query.order_by(PaymentRequest.created_at.desc()).all()

    return [
        PaymentRequestAdminOut(
            id=pr.id,
            user_id=pr.user_id,
            user_email=user.email,
            plan_requested=pr.plan_requested,
            amount=pr.amount,
            currency=pr.currency,
            momo_network=pr.momo_network,
            momo_reference=pr.momo_reference,
            momo_sender_number=pr.momo_sender_number,
            status=pr.status,
            reviewed_at=pr.reviewed_at,
            review_note=pr.review_note,
            created_at=pr.created_at,
        )
        for pr, user in rows
    ]


@router.patch("/payment-requests/{request_id}", response_model=PaymentRequestAdminOut)
def review_payment_request(request_id: str, payload: PaymentRequestReview, db: Session = Depends(get_db)):
    if payload.action not in {"confirm", "reject"}:
        raise HTTPException(400, "action must be 'confirm' or 'reject'")

    pr = db.query(PaymentRequest).filter(PaymentRequest.id == request_id).first()
    if pr is None:
        raise HTTPException(404, "Payment request not found")
    if pr.status != "pending":
        raise HTTPException(400, f"Already reviewed (status: {pr.status})")

    pr.status = "confirmed" if payload.action == "confirm" else "rejected"
    pr.reviewed_at = datetime.utcnow()
    pr.review_note = payload.review_note

    if payload.action == "confirm":
        user = db.query(User).filter(User.id == pr.user_id).first()
        if user is not None:
            user.plan = pr.plan_requested

    db.commit()
    db.refresh(pr)
    user = db.query(User).filter(User.id == pr.user_id).first()

    return PaymentRequestAdminOut(
        id=pr.id, user_id=pr.user_id, user_email=user.email if user else "unknown",
        plan_requested=pr.plan_requested, amount=pr.amount, currency=pr.currency,
        momo_network=pr.momo_network, momo_reference=pr.momo_reference,
        momo_sender_number=pr.momo_sender_number, status=pr.status,
        reviewed_at=pr.reviewed_at, review_note=pr.review_note, created_at=pr.created_at,
    )
