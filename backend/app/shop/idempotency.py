"""Idempotency-Key store (port of the mutationRequests pattern).

Same key + same body → replayed WITHOUT re-applying (fresh snapshots,
never stale). Same key + different body → 409 REQUEST_CONFLICT.
Flaky mobile networks double-submit daily in this market; this is what
makes that safe instead of catastrophic.
"""

import hashlib
import json

from sqlalchemy.orm import Session

from app.models import ShopIdempotencyKey
from app.shop.errors import Conflict


def fingerprint(resource: str, payload: dict | None, record_id: str | None, remove: bool) -> str:
    canonical = json.dumps(
        {"resource": resource, "input": payload, "id": record_id, "remove": remove},
        sort_keys=True, separators=(",", ":"), default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def check_replay(
    db: Session, business_id: str, key: str | None,
    resource: str, payload: dict | None,
    record_id: str | None = None, remove: bool = False,
) -> dict | None:
    """Returns the stored response on exact replay, raises on conflict,
    returns None when this key hasn't been seen (caller proceeds)."""
    if not key:
        return None
    row = (
        db.query(ShopIdempotencyKey)
        .filter(ShopIdempotencyKey.business_id == business_id, ShopIdempotencyKey.key == key)
        .first()
    )
    if row is None:
        return None
    if row.fingerprint != fingerprint(resource, payload, record_id, remove):
        raise Conflict(
            "This retry belongs to different changes. Reopen the form and try again.",
            code="REQUEST_CONFLICT",
        )
    return dict(row.response)


def remember(
    db: Session, business_id: str, key: str | None,
    resource: str, payload: dict | None, response: dict,
    record_id: str | None = None, remove: bool = False,
) -> None:
    if not key:
        return
    db.add(ShopIdempotencyKey(
        business_id=business_id, key=key,
        fingerprint=fingerprint(resource, payload, record_id, remove),
        response=response,
    ))