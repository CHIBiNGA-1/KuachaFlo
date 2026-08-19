from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Optional

from app.database import get_db
from app.models import Category

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str
    icon: Optional[str] = None


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.name).all()
