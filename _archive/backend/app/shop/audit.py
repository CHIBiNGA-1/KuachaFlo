"""Audit events (port of appendAudit)."""

from sqlalchemy.orm import Session

from app.models import ShopAuditEvent


def record(
    db: Session, *, business_id: str, user_id: str, request_id: str,
    action: str, resource: str, record_id: str | None = None, metadata: dict | None = None,
) -> None:
    db.add(ShopAuditEvent(
        business_id=business_id, user_id=user_id, request_id=request_id,
        action=action, resource=resource, record_id=record_id,
        event_metadata=metadata or {},
    ))
