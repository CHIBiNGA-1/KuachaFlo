from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict

from app.database import get_db
from app.models import Category

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str
    icon: Optional[str] = None
    kinds: list[str] = []


@router.get("", response_model=list[CategoryOut])
def list_categories(
    type: Optional[Literal["personal", "shop", "expense"]] = Query(None),
    db: Session = Depends(get_db),
):
    rows = db.query(Category).order_by(Category.name).all()
    if type is not None:
        # kinds NULL = legacy personal-only (see ledger._category_valid_for).
        rows = [c for c in rows if type in (c.kinds or ["personal"])]
    return [
        CategoryOut(
            id=c.id, name=c.name, slug=c.slug, icon=c.icon, kinds=c.kinds or ["personal"]
        )
        for c in rows
    ]
