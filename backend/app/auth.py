import time
import logging

import httpx
import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException

from app.config import settings

_jwk_client: PyJWKClient | None = None
_jwk_client_created_at: float = 0.0
_JWK_CLIENT_TTL = 3600


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client, _jwk_client_created_at
    now = time.time()
    if _jwk_client is None or (now - _jwk_client_created_at) > _JWK_CLIENT_TTL:
        _jwk_client = PyJWKClient(settings.supabase_jwks_url)
        _jwk_client_created_at = now
    return _jwk_client


def verify_token(token: str) -> dict:
    """Verifies a Supabase-issued access token and returns its claims."""
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            options={"verify_exp": True},
        )
        return claims
    except Exception as e:
        logging.warning(f"Token verification failed: {e}")
        raise HTTPException(401, "Invalid or expired session")


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    claims = verify_token(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(401, "Token has no subject")
    return user_id
