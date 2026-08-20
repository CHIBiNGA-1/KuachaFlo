from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/api/v1", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user
