from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.deps import get_current_user
from app.models import User
from app.schemas import UserOut
from app.kratte_client import build_sso_url

router = APIRouter(prefix="/api/v1", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/kratte/sso-url")
def get_kratte_sso_url(user: User = Depends(get_current_user)):
    if not user.email:
        raise HTTPException(400, "Your account needs an email set before opening KraTte.")
    if not settings.kratte_sso_secret:
        raise HTTPException(503, "KraTte isn't connected yet.")
    return {"url": build_sso_url(user.email, user.full_name, user.plan)}
