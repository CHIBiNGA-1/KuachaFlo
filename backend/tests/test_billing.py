"""Billing tests: claim validation, profile auto-create, review flow, and
the admin guard. No network (Telegram is a no-op unconfigured), no auth —
handlers are called directly with a fake user dict.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import telegram
from app.config import settings
from app.db import Base
from app.deps import require_admin
from app.limiter import limiter
from app.models import LedgerEntry, PaymentRequest, Profile
from app.routers import admin, billing

USER = {"id": "u1", "email": "m@test.zm"}

# These tests call route handlers directly, bypassing the ASGI layer
# slowapi's middleware runs in — so the rate limit added in
# submit_payment_request (finding #4) is irrelevant noise here and is
# tested for real, end-to-end, in test_rate_limit.py instead.
limiter.enabled = False


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _claim(db, **kw):
    payload = billing.PaymentRequestCreate(
        plan_requested="pro", amount=150, currency="ZMW",
        momo_network="airtel", momo_reference="MP123", **kw,
    )
    return billing.submit_payment_request(request=None, payload=payload, user=USER, db=db)


def test_claim_validation(db):
    base = {"plan_requested": "pro", "amount": 150, "momo_network": "airtel",
            "momo_reference": "MP123"}
    with pytest.raises(HTTPException) as e:
        billing.submit_payment_request(
            request=None,
            payload=billing.PaymentRequestCreate(**{**base, "plan_requested": "free"}),
            user=USER, db=db)
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        billing.submit_payment_request(
            request=None,
            payload=billing.PaymentRequestCreate(**{**base, "momo_network": "zamtel"}),
            user=USER, db=db)
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        billing.submit_payment_request(
            request=None,
            payload=billing.PaymentRequestCreate(**{**base, "momo_reference": "  "}),
            user=USER, db=db)
    assert e.value.status_code == 400


def test_claim_creates_pending_and_profile(db):
    out = _claim(db)
    assert out["status"] == "pending" and out["plan_requested"] == "pro"
    assert out["amount"] == 150.0
    profile = db.get(Profile, "u1")
    assert profile is not None and profile.plan == "free"
    assert profile.email == "m@test.zm"  # stamped from the token


def test_mine_lists_only_mine(db):
    _claim(db)
    other = billing.PaymentRequestCreate(
        plan_requested="business", amount=450, momo_network="mtn", momo_reference="X")
    billing.submit_payment_request(request=None, payload=other, user={"id": "u2", "email": "x@y.zm"}, db=db)
    mine = billing.list_my_payment_requests(user=USER, db=db)
    assert len(mine) == 1 and mine[0]["momo_reference"] == "MP123"


def test_confirm_sets_the_plan(db):
    out = _claim(db)
    reviewed = admin.review_payment_request(
        out["id"], admin.PaymentRequestReview(action="confirm"), db=db)
    assert reviewed["status"] == "confirmed" and reviewed["reviewed_at"]
    assert reviewed["user_email"] == "m@test.zm"
    assert db.get(Profile, "u1").plan == "pro"


def test_reject_keeps_free(db):
    out = _claim(db)
    reviewed = admin.review_payment_request(
        out["id"], admin.PaymentRequestReview(action="reject", review_note="no match"), db=db)
    assert reviewed["status"] == "rejected"
    assert reviewed["review_note"] == "no match"
    assert db.get(Profile, "u1").plan == "free"


def test_review_guards(db):
    out = _claim(db)
    with pytest.raises(HTTPException) as e:
        admin.review_payment_request(
            out["id"], admin.PaymentRequestReview(action="maybe"), db=db)
    assert e.value.status_code == 400
    admin.review_payment_request(
        out["id"], admin.PaymentRequestReview(action="confirm"), db=db)
    with pytest.raises(HTTPException) as e:
        admin.review_payment_request(
            out["id"], admin.PaymentRequestReview(action="reject"), db=db)
    assert e.value.status_code == 400  # already reviewed
    with pytest.raises(HTTPException) as e:
        admin.review_payment_request("nope", admin.PaymentRequestReview(action="confirm"), db=db)
    assert e.value.status_code == 404


def test_set_plan(db):
    db.add(Profile(id="u1", plan="free"))
    db.commit()
    out = admin.set_user_plan("u1", admin.PlanUpdate(plan="business"), db=db)
    assert out["plan"] == "business"
    with pytest.raises(HTTPException) as e:
        admin.set_user_plan("u1", admin.PlanUpdate(plan="gold"), db=db)
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        admin.set_user_plan("ghost", admin.PlanUpdate(plan="pro"), db=db)
    assert e.value.status_code == 404


def test_list_users_counts_entries(db):
    from datetime import date

    db.add(Profile(id="u1", plan="pro"))
    db.add(LedgerEntry(user_id="u1", direction="out", amount=1,
                       occurred_on=date(2026, 9, 1)))
    db.commit()
    users = admin.list_users(db=db)
    assert users == [{"id": "u1", "email": None,
                      "plan": "pro", "entry_count": 1}]


def test_admin_guard_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "admin_api_key", "")
    with pytest.raises(HTTPException) as e:
        require_admin(None)
    assert e.value.status_code == 503
    monkeypatch.setattr(settings, "admin_api_key", "secret")
    with pytest.raises(HTTPException) as e:
        require_admin("wrong")
    assert e.value.status_code == 401
    assert require_admin("secret") is None


def test_telegram_is_noop_unconfigured():
    assert telegram.notify_admin("hello") is None