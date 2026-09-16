"""Request dependencies: who are you, and are you allowed near /admin."""

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from sqlalchemy.orm import Session

from app.auth import AuthError, verify_token
from app.config import settings
from app.models import LedgerEntry

bearer = HTTPBearer(auto_error=False)


class LimitReached(Exception):
    def __init__(self, limit: int, count: int):
        self.limit = limit
        self.count = count
        super().__init__(f"plan limit reached ({count}/{limit})")


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Sign in first.")
    try:
        return verify_token(creds.credentials)
    except AuthError:
        raise HTTPException(status_code=401, detail="That sign-in expired — please sign in again.")


def check_limit(db: Session, user_id: str, plan: str) -> None:
    """Raises LimitReached when the plan's ledger-entry cap is hit. Counts
    this account's shop money movements (sales, purchases, expenses)."""
    limit = settings.plan_limits.get(plan or "free")
    if limit is None:
        return
    count = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.user_id == user_id, LedgerEntry.is_deleted.is_(False))
        .count()
    )
    if count >= limit:
        raise LimitReached(limit, count)


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    """Guards every /api/v1/admin/* route. Not full auth (no user accounts,
    no roles) — just a shared secret only the founder knows, sent as the
    X-Admin-Key header. Right-sized for a solo-admin app; upgrade to real
    role-based auth if a second admin ever joins."""
    if not settings.admin_api_key:
        # Fail closed: an unset key must never mean "open to everyone".
        raise HTTPException(status_code=503, detail="Admin API is not configured.")
    if not x_admin_key or x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing admin key.")
