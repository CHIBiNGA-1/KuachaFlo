import uuid
import logging

import httpx
from fastapi import HTTPException

from app.config import settings


def upload_image(bucket: str, user_id: str, image_bytes: bytes, content_type: str = "image/jpeg") -> str:
    key = f"{user_id}/{uuid.uuid4()}.jpg"
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{key}"
    try:
        resp = httpx.post(
            url,
            content=image_bytes,
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            timeout=30.0,
        )
    except httpx.RequestError as e:
        logging.error(f"Storage upload failed: {e}")
        raise HTTPException(502, "Couldn't save the image right now — try again.")

    if resp.status_code >= 400:
        logging.error(f"Storage upload rejected: {resp.status_code} {resp.text}")
        raise HTTPException(502, "Couldn't save the image right now — try again.")

    return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/{bucket}/{key}"
