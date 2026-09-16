"""KraTte API — FastAPI entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routers import admin, billing, shop, whatsapp
from app.shop.errors import ShopError, shop_error_handler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="KraTte", lifespan=lifespan)

origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
    # No cookies — Bearer tokens only — so "*" origins stay safe.
    allow_credentials=False,
)

# Shop domain errors → {"error", "code"} JSON, never a stack trace.
app.add_exception_handler(ShopError, shop_error_handler)

app.include_router(shop.router)
app.include_router(billing.router)
app.include_router(admin.router)
app.include_router(whatsapp.router)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/")
def root():
    return {"name": "KraTte", "health": "/healthz"}
