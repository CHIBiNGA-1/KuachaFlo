"""Shared rate-limiter instance.

Imported by main.py (which wires it into the app and sets the app-wide
default) and by any router that needs a stricter limit than that default
on a specific abuse-prone endpoint (admin auth, payment-request
submission, WhatsApp link-code generation).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Keyed by IP by default. Good enough for a solo-shop app at current
# scale; a route that needs per-user limiting can pass its own key_func
# to @limiter.limit(...).
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
