"""Shared fixtures for contract tests.

Each test gets a FRESH in-memory SQLite database + a TestClient whose
auth/db dependencies are overridden. No test here ever touches the real
database, Gemini, Meta, or Supabase.

Run from backend/:  ../.venv/bin/python -m pytest tests/ -q
"""

import os
import sys
import uuid
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.deps import get_current_user
from app.main import app


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def seed_categories(db):
    """Minimal category set tests need. Independent of the app's own seed
    (which is itself under test in test_contract_taxonomy.py)."""
    from app.models import Category

    rows = [
        Category(id="cat-meals", name="Meals & Food", slug="meals", icon="🍔"),
        Category(id="cat-other", name="Other", slug="other", icon="📎"),
        Category(id="cat-snacks", name="Snacks", slug="snacks", icon="🍿"),
    ]
    # kinds column only exists after Phase 1 migration — set it when present.
    for r in rows:
        if hasattr(r, "kinds"):
            r.kinds = (
                ["personal", "shop", "expense"]
                if r.slug == "other"
                else (["shop"] if r.slug == "snacks" else ["personal", "expense"])
            )
    db.add_all(rows)
    db.commit()
    return {r.slug: r for r in rows}


def _make_user(db, email="joseph@example.com", plan="free"):
    from app.models import User

    user = User(
        id=str(uuid.uuid4()),
        supabase_uid=f"supabase-{uuid.uuid4()}",
        email=email,
        full_name="Test User",
        plan=plan,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def user(db):
    return _make_user(db, email="joseph@example.com")


@pytest.fixture()
def other_user(db):
    return _make_user(db, email="amara@example.com")


@pytest.fixture()
def business(db, user):
    from app.models import Business

    b = Business(
        id=str(uuid.uuid4()), owner_user_id=user.id, name="Joseph Shop", currency="ZMW"
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@pytest.fixture()
def client(db, user):
    """TestClient authenticated as `user`. NOTE: deliberately NOT used as a
    context manager — entering the context would run app lifespan (init_db)
    against the REAL database engine."""
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    c = TestClient(app, raise_server_exceptions=False)
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def client_as_other(db, other_user):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: other_user
    c = TestClient(app, raise_server_exceptions=False)
    try:
        yield c
    finally:
        app.dependency_overrides.clear()


def make_entry(
    db,
    user,
    *,
    party="Shoprite",
    amount=50.0,
    direction="out",
    business_id=None,
    occurred_on=None,
    category_id=None,
    source="app_photo",
    status="processed",
    confidence="high",
    order_id=None,
    line_items=None,
    is_deleted=False,
):
    """Creates a ledger row through the CURRENT model shape.

    Pre-Phase-1 this writes to `receipts` (with the Phase-1-step-1 columns);
    post-Phase-1 it writes to `ledger_entries`. Tests assert on API output,
    never on which table backs it — that's the point of a contract test.
    """
    from app import models

    if hasattr(models, "LedgerEntry"):
        row = models.LedgerEntry(
            id=str(uuid.uuid4()),
            user_id=user.id,
            business_id=business_id,
            direction=direction,
            amount=amount,
            currency="ZMW",
            party=party,
            category_id=category_id,
            occurred_on=occurred_on or date(2026, 9, 1),
            source=source,
            status=status,
            confidence=confidence,
            order_id=order_id,
            line_items=line_items,
            is_deleted=is_deleted,
        )
    else:
        row = models.Receipt(
            id=str(uuid.uuid4()),
            user_id=user.id,
            business_id=business_id,
            direction=direction,
            merchant=party,
            total_amount=amount,
            currency="ZMW",
            category_id=category_id,
            purchase_date=occurred_on or date(2026, 9, 1),
            source=source,
            status=status,
            confidence=confidence,
            line_items=line_items,
            is_deleted=is_deleted,
        )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
