import logging
import os
import uuid
from io import BytesIO

import httpx
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.config import settings

# Registers HEIC/HEIF as a format Image.open() understands — iPhones save
# photo-library images this way by default (not just camera captures), and
# plain Pillow can't decode it without this.
register_heif_opener()

# Render's free-tier filesystem is wiped on every deploy — anything saved
# to local disk (the old behaviour of this module) disappears the next time
# code ships. Everything here goes to Supabase Storage instead, which is
# the durable path. Local disk is kept only as a dev-mode fallback for
# running without a Supabase project configured at all.
_USE_SUPABASE = bool(settings.supabase_url and settings.supabase_service_role_key)

if not _USE_SUPABASE:
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.reports_dir, exist_ok=True)
    logging.warning(
        "SUPABASE_SERVICE_ROLE_KEY not set — falling back to local disk "
        "storage. Fine for local dev; do NOT run production like this, "
        "uploads will be lost on every redeploy."
    )


def _upload_to_supabase(bucket: str, path: str, data: bytes, content_type: str) -> None:
    url = f"{settings.supabase_storage_url}/object/{bucket}/{path}"
    resp = httpx.post(
        url,
        content=data,
        headers={
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        timeout=30.0,
    )
    if resp.status_code >= 400:
        logging.error("Supabase Storage upload failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(502, "Couldn't save the image right now — try again.")


def save_receipt_image(image_bytes: bytes, user_id: str) -> tuple[str, str]:
    """
    Saves the original + a 400px-wide thumbnail. Returns (image_path,
    thumbnail_path) as public URLs (Supabase Storage) or web-servable
    /uploads paths (local dev fallback).
    """
    receipt_id = str(uuid.uuid4())
    original_name = f"{receipt_id}.jpg"
    thumb_name = f"{receipt_id}_thumb.jpg"

    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError:
        # A content-type of "image/*" doesn't guarantee Pillow can decode
        # it (truncated upload, unsupported format, etc.) — fail cleanly
        # with a 400 instead of a 500.
        raise HTTPException(400, "Couldn't read that image — try a JPEG or PNG.")

    original_buf = BytesIO()
    image.save(original_buf, "JPEG", quality=85)

    thumb = image.copy()
    thumb.thumbnail((400, 400))
    thumb_buf = BytesIO()
    thumb.save(thumb_buf, "JPEG", quality=80)

    if _USE_SUPABASE:
        original_key = f"{user_id}/{original_name}"
        thumb_key = f"{user_id}/{thumb_name}"
        _upload_to_supabase("receipts", original_key, original_buf.getvalue(), "image/jpeg")
        _upload_to_supabase("receipts", thumb_key, thumb_buf.getvalue(), "image/jpeg")
        base = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/receipts"
        return f"{base}/{original_key}", f"{base}/{thumb_key}"

    user_dir = os.path.join(settings.upload_dir, user_id)
    os.makedirs(user_dir, exist_ok=True)
    with open(os.path.join(user_dir, original_name), "wb") as f:
        f.write(original_buf.getvalue())
    with open(os.path.join(user_dir, thumb_name), "wb") as f:
        f.write(thumb_buf.getvalue())
    return f"/uploads/{user_id}/{original_name}", f"/uploads/{user_id}/{thumb_name}"


def save_report_pdf(pdf_bytes: bytes, user_id: str) -> str:
    """
    Saves a generated report PDF. Returns a Supabase Storage path (private
    bucket — served via a signed URL from the authenticated download
    endpoint) or a local filesystem path (dev fallback).
    """
    key = f"{user_id}/{uuid.uuid4()}.pdf"

    if _USE_SUPABASE:
        _upload_to_supabase("reports", key, pdf_bytes, "application/pdf")
        return key  # bucket-relative path; resolved to a signed URL on download

    user_dir = os.path.join(settings.reports_dir, user_id)
    os.makedirs(user_dir, exist_ok=True)
    path = os.path.join(user_dir, os.path.basename(key))
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return path


def signed_report_url(pdf_path: str, expires_in: int = 300) -> str:
    """Creates a short-lived signed URL for a private report PDF stored in
    Supabase Storage. Only called when _USE_SUPABASE is True."""
    url = f"{settings.supabase_storage_url}/object/sign/reports/{pdf_path}"
    resp = httpx.post(
        url,
        json={"expiresIn": expires_in},
        headers={
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
        },
        timeout=15.0,
    )
    if resp.status_code >= 400:
        logging.error("Supabase signed URL failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(502, "Couldn't fetch the report right now — try again.")
    signed_path = resp.json()["signedURL"]
    return f"{settings.supabase_storage_url}{signed_path}" if signed_path.startswith("/") else signed_path


def uses_supabase_storage() -> bool:
    return _USE_SUPABASE
