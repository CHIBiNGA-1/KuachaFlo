from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Receipt
from app.schemas import AdminUserOut, PlanUpdate

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

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
