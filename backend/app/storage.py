import os
import uuid
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.config import settings

# Registers HEIC/HEIF as a format Image.open() understands — iPhones save
# photo-library images this way by default (not just camera captures), and
# plain Pillow can't decode it without this.
register_heif_opener()

os.makedirs(settings.upload_dir, exist_ok=True)


def save_receipt_image(image_bytes: bytes, user_id: str) -> tuple[str, str]:
    """
    Saves the original + a 400px-wide thumbnail to local disk.
    Returns (image_path, thumbnail_path) as web-servable paths under /uploads/...

    Swap this function's body for a Cloudinary upload later — callers don't
    need to change since they just deal with the two returned paths/URLs.
    """
    user_dir = os.path.join(settings.upload_dir, user_id)
    os.makedirs(user_dir, exist_ok=True)

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

    original_path = os.path.join(user_dir, original_name)
    image.save(original_path, "JPEG", quality=85)

    thumb = image.copy()
    thumb.thumbnail((400, 400))
    thumb_path = os.path.join(user_dir, thumb_name)
    thumb.save(thumb_path, "JPEG", quality=80)

    # Web-servable paths (main.py mounts settings.upload_dir at /uploads)
    return f"/uploads/{user_id}/{original_name}", f"/uploads/{user_id}/{thumb_name}"


os.makedirs(settings.reports_dir, exist_ok=True)


def save_report_pdf(pdf_bytes: bytes, user_id: str) -> str:
    """
    Saves a generated report PDF to local disk. Returns a filesystem path
    (not a URL — reports are served through an authenticated download
    endpoint, not a public static mount).
    """
    user_dir = os.path.join(settings.reports_dir, user_id)
    os.makedirs(user_dir, exist_ok=True)

    path = os.path.join(user_dir, f"{uuid.uuid4()}.pdf")
    with open(path, "wb") as f:
        f.write(pdf_bytes)

    return path
