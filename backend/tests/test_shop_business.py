"""Contract tests for the business endpoints (shop settings)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Profile


@pytest.fixture
def shop_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/biz.db")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add(Profile(id="u1", plan="free"))
    session.add(Profile(id="u2", plan="free"))
    session.commit()
    yield session
    session.close()


@pytest.fixture
def client(shop_db):
    from app.db import get_db
    from app.deps import get_current_user
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "s@test.zm"}
    app.dependency_overrides[get_db] = lambda: shop_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_business_autoprovisions_with_defaults(client):
    b = client.get("/api/v1/shop/business").json()
    assert b["name"] == "My Shop"
    assert b["currency"] == "ZMW"
    assert b["id"]


def test_business_rename(client):
    b = client.patch("/api/v1/shop/business", json={"name": "Chileshe's Corner"}).json()
    assert b["name"] == "Chileshe's Corner"
    assert client.get("/api/v1/shop/business").json()["name"] == "Chileshe's Corner"


def test_business_rename_validation(client):
    assert client.patch("/api/v1/shop/business", json={"name": ""}).status_code == 422
    assert client.patch("/api/v1/shop/business", json={}).status_code == 422
    assert client.patch("/api/v1/shop/business", json={"currency": "USD"}).status_code == 422


def test_business_autoprovisions_for_any_signed_in_user(client, shop_db):
    """No mode gate: a second signed-in user gets their own shop, on the
    first request, with no setup step."""
    from app.db import get_db
    from app.deps import get_current_user
    from app.main import app

    b1 = client.get("/api/v1/shop/business").json()

    app.dependency_overrides[get_current_user] = lambda: {"id": "u2"}
    app.dependency_overrides[get_db] = lambda: shop_db
    try:
        c = TestClient(app)
        b2 = c.get("/api/v1/shop/business").json()
        assert b2["name"] == "My Shop"
        assert b1["id"] != b2["id"]
    finally:
        app.dependency_overrides.clear()