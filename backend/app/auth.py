"""Supabase JWT verification via JWKS — ported from the archived engine.

The frontend signs in with Supabase Auth and sends the access token as a
Bearer token; we verify the signature against Supabase's JWKS and read
the user id (sub) out of it. No service key involved.
"""

import jwt
from jwt import PyJWKClient

from app.config import settings

_jwks_client: PyJWKClient | None = None


class AuthError(Exception):
    pass


def _jwks_url() -> str:
    if settings.supabase_jwks_url:
        return settings.supabase_jwks_url
    if settings.supabase_url:
        return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    raise AuthError("Supabase is not configured on the server.")


def _client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(_jwks_url())
    return _jwks_client


def verify_token(token: str) -> dict:
    """Returns {"id": user_id, "email": ...} or raises AuthError."""
    try:
        key = _client().get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token,
            key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            options={"require": ["sub", "exp"]},
        )
    except AuthError:
        raise
    except Exception as e:
        raise AuthError(f"Invalid token: {e}")
    return {"id": payload["sub"], "email": payload.get("email")}
