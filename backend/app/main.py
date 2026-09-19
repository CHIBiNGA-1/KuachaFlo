"""KraTte API — FastAPI entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routers import admin, billing, shop, whatsapp
from app.shop.errors import ShopError, shop_error_handler

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="KraTte", lifespan=lifespan)

origins = [o.strip().rstrip("/") for o in settings.allowed_origins.split(",") if o.strip()]
if not origins:
    origins = ["*"]
if origins == ["*"]:
    # Safe here only because we never accept cookies — auth is a Bearer
    # token the caller must already hold. Still worth narrowing once the
    # production domain is known, so log it rather than letting it pass
    # silently into production.
    log.warning(
        "ALLOWED_ORIGINS is '*'. Set it to your site's exact origin "
        "(e.g. https://kratte.vercel.app) once the domain is fixed."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
    # No cookies — Bearer tokens only — so "*" origins stay safe.
    allow_credentials=False,
)


@app.middleware("http")
async def security_headers(request, call_next):
    """The API serves JSON, never markup, so lock the browser down hard:
    nothing here should ever be rendered, framed, or sniffed."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Cache-Control"] = "no-store"
    return response

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
