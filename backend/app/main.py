import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import receipts, admin, categories, reports, billing, users, whatsapp, business, ledger, ingest
from app.storage import uses_supabase_storage

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup ---
    init_db()
    if not uses_supabase_storage():
        os.makedirs(settings.upload_dir, exist_ok=True)

    import logging
    if not settings.gemini_api_key:
        logging.warning(
            "GEMINI_API_KEY is not set. Receipt uploads will fail until it's "
            "configured — see README."
        )

    yield

app = FastAPI(
    title="SnapLedger API — Local Stage",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(receipts.router)
app.include_router(admin.router)
app.include_router(categories.router)
app.include_router(reports.router)
app.include_router(billing.router)
app.include_router(users.router)
app.include_router(whatsapp.router)
app.include_router(business.router)
app.include_router(ledger.router)
app.include_router(ingest.router)

# Serves uploaded receipt images at /uploads/{user_id}/{file}.jpg — only
# relevant in local-dev fallback mode; in production images live in
# Supabase Storage and are served directly from there.
if not uses_supabase_storage():
    os.makedirs(settings.upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# Serves the plain-HTML admin dashboard at /admin/
app.mount("/admin", StaticFiles(directory="static", html=True), name="admin")

@app.get("/health")
def health():
    return {"status": "ok"}
