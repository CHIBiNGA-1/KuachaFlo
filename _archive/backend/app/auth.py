"""
Verifies Supabase Auth JWTs.

Supabase signs session tokens with an asymmetric key (ES256/RS256) and
publishes the public half at /auth/v1/.well-known/jwks.json. We fetch that
once, cache it, and use it to verify tokens ourselves — no secret key, no
network call to Supabase per-request, no way for this backend to forge or
read other users' data.
"""

import time
import logging

import httpx
import jwt
from jwt import PyJWKClient

from app.config import settings

_jwk_client: PyJWKClient | None = None
_jwk_client_created_at: float = 0
_JWKS_CACHE_SECONDS = 3600  # PyJWKClient caches signing keys internally too


class TokenInvalid(Exception):
    pass


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client, _jwk_client_created_at

    now = time.time()
    if _jwk_client is None or (now - _jwk_client_created_at) > _JWKS_CACHE_SECONDS:
        if not settings.supabase_url:
            raise TokenInvalid("SUPABASE_URL is not configured on the backend")
        _jwk_client = PyJWKClient(settings.supabase_jwks_url)
        _jwk_client_created_at = now

    return _jwk_client


def verify_token(token: str) -> dict:
    """
    Verifies a Supabase access token and returns its claims (sub, email,
    etc). Raises TokenInvalid for anything wrong with the token — expired,
    malformed, wrong signature, wrong audience.
    """
    try:
        client = _get_jwk_client()
        signing_key = client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",  # Supabase's standard audience claim
            options={"require": ["exp", "sub"]},
        )
        return claims
    except jwt.ExpiredSignatureError:
        raise TokenInvalid("Session expired — please sign in again")
    except jwt.PyJWTError as e:
        logging.warning(f"JWT verification failed: {e}")
        raise TokenInvalid("Invalid session token")
    except httpx.HTTPError as e:
        logging.error(f"Could not fetch Supabase JWKS: {e}")
        raise TokenInvalid("Could not verify session — auth service unreachable")
