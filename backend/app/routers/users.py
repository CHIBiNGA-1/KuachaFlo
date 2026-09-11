from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User, Business
from app.schemas import UserOut
from app.kratte_client import build_sso_url

router = APIRouter(prefix="/api/v1", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/kratte/sso-url")
def get_kratte_sso_url(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.email:
        raise HTTPException(400, "Your account needs an email set before opening KraTte.")
    if not settings.kratte_sso_secret:
        raise HTTPException(503, "KraTte isn't connected yet.")

    # First time opening KraTte from this account — establish the
    # business record now, since everything in Phase 1/2 of the ledger
    # unification hangs off owner_user_id -> business_id existing.
    business = db.query(Business).filter(Business.owner_user_id == user.id).first()
    if business is None:
        business = Business(owner_user_id=user.id)
        db.add(business)
        db.commit()

    return {"url": build_sso_url(user.email, user.full_name, user.plan)}
