"""Rate-limit check for /billing/payment-request (finding #4 of the
security review). Unlike the other tests in this suite, this one goes
through a real TestClient/ASGI app so slowapi's middleware actually runs
— the direct-function-call style used elsewhere bypasses it entirely.
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401 — registers tables on Base.metadata
from app.db import Base, get_db
from app.deps import get_current_user
from app.limiter import limiter
from app.main import app

USER = {"id": "rl1", "email": "rl@test.zm"}


def _client() -> TestClient:
    # TestClient runs the app in a separate thread; a plain
    # sqlite:///:memory: engine hands each thread its own empty database
    # unless pinned to a single shared connection via StaticPool.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()

    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: USER
    limiter.enabled = True
    limiter.reset()  # clean bucket, independent of any earlier test
    return TestClient(app)


def test_payment_request_is_rate_limited():
    client = _client()
    payload = {"plan_requested": "pro", "momo_network": "airtel", "momo_reference": "MP1"}
    try:
        for _ in range(5):
            r = client.post("/api/v1/billing/payment-request", json=payload)
            assert r.status_code == 200, r.text
        r = client.post("/api/v1/billing/payment-request", json=payload)
        assert r.status_code == 429
    finally:
        app.dependency_overrides.clear()
        limiter.reset()


def test_payment_request_amount_is_server_computed():
    """Finding #1: a client-supplied amount is ignored — the price comes
    from plan_requested, not the request body."""
    client = _client()
    payload = {
        "plan_requested": "business",
        "amount": 1,  # tampered — real price is 450
        "momo_network": "mtn",
        "momo_reference": "MP2",
    }
    try:
        r = client.post("/api/v1/billing/payment-request", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == 450.0
    finally:
        app.dependency_overrides.clear()
        limiter.reset()
