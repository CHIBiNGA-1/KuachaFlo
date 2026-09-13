from pydantic import BaseModel
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.models import ShopProduct, ShopSale
from app.storage import upload_image

router = APIRouter(prefix="/api/shop", tags=["shop"])


def _product_dict(p: ShopProduct) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "sku": p.sku,
        "price": float(p.price or 0),
        "cost": float(p.cost or 0),
        "stock": p.stock,
        "image_url": p.image_url,
        "created_at": p.created_at.isoformat(),
    }


class ProductCreate(BaseModel):
    name: str
    sku: str | None = None
    price: float = 0
    cost: float = 0
    stock: int = 0


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    price: float | None = None
    cost: float | None = None
    stock: int | None = None


@router.get("/products")
def list_products(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    products = (
        db.query(ShopProduct)
        .filter(ShopProduct.user_id == user_id)
        .order_by(ShopProduct.created_at.desc())
        .all()
    )
    return [_product_dict(p) for p in products]


@router.post("/products")
def create_product(
    payload: ProductCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
):
    product = ShopProduct(user_id=user_id, **payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return _product_dict(product)


@router.post("/products/{product_id}/image")
def upload_product_image(
    product_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    product = db.query(ShopProduct).filter(ShopProduct.id == product_id, ShopProduct.user_id == user_id).first()
    if product is None:
        raise HTTPException(404, "Product not found")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    image_bytes = file.file.read()
    product.image_url = upload_image("kratte-products", user_id, image_bytes, file.content_type)
    db.commit()
    db.refresh(product)
    return _product_dict(product)


@router.patch("/products/{product_id}")
def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    product = db.query(ShopProduct).filter(ShopProduct.id == product_id, ShopProduct.user_id == user_id).first()
    if product is None:
        raise HTTPException(404, "Product not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return _product_dict(product)


@router.delete("/products/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    product = db.query(ShopProduct).filter(ShopProduct.id == product_id, ShopProduct.user_id == user_id).first()
    if product is None:
        raise HTTPException(404, "Product not found")
    db.delete(product)
    db.commit()
    return {"ok": True}


class SaleCreate(BaseModel):
    product_id: str
    quantity: int = 1


@router.post("/sales")
def record_sale(payload: SaleCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    if payload.quantity < 1:
        raise HTTPException(400, "Quantity must be at least 1")

    product = (
        db.query(ShopProduct).filter(ShopProduct.id == payload.product_id, ShopProduct.user_id == user_id).first()
    )
    if product is None:
        raise HTTPException(404, "Product not found")
    if product.stock < payload.quantity:
        raise HTTPException(400, f"Not enough stock — only {product.stock} left")

    product.stock -= payload.quantity
    total = float(product.price or 0) * payload.quantity

    sale = ShopSale(
        user_id=user_id,
        product_id=product.id,
        product_name=product.name,
        quantity=payload.quantity,
        unit_price=product.price,
        total=total,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)

    return {
        "id": sale.id,
        "product_name": sale.product_name,
        "quantity": sale.quantity,
        "unit_price": float(sale.unit_price or 0),
        "total": float(sale.total or 0),
        "sold_at": sale.sold_at.isoformat(),
    }


@router.get("/sales")
def list_sales(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    sales = (
        db.query(ShopSale)
        .filter(ShopSale.user_id == user_id)
        .order_by(ShopSale.sold_at.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": s.id,
            "product_name": s.product_name,
            "quantity": s.quantity,
            "unit_price": float(s.unit_price or 0),
            "total": float(s.total or 0),
            "sold_at": s.sold_at.isoformat(),
        }
        for s in sales
    ]
