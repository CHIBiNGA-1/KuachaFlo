"""Shop capture tests: tallies in → rung-up sales. No network —
send_text/download_media/classify are all faked."""

import io

import pytest
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import shop_capture as cap
from app.db import Base
from app.models import Business, LedgerEntry, Order, Product, Profile
from app.routers import whatsapp as router

SENDER = "260977123456"


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def sent(monkeypatch):
    out = []
    monkeypatch.setattr(router, "send_text", lambda to, body: out.append((to, body)))
    return out


def _profile(db, **kw):
    base = {"id": "u1", "plan": "free",
            "whatsapp_number": SENDER}
    base.update(kw)
    p = Profile(**base)
    db.add(p)
    db.commit()
    return p


def _business(db, owner="u1"):
    b = Business(owner_user_id=owner, name="My Shop", currency="ZMW")
    db.add(b)
    db.commit()
    return b


def _product(db, business_id, name="Coke", stock=10):
    p = Product(business_id=business_id, name=name, sku="CK-1",
                sku_normalized="ck-1", category="Beverages", price=15.0,
                cost=11.0, stock=stock, reorder_at=2)
    db.add(p)
    db.commit()
    return p


def _photo() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (12, 12), color="blue").save(buf, "JPEG")
    return buf.getvalue()


def _sheet(**kw):
    draft = {"kind": "sales_sheet", "party": "Day sales",
             "occurred_on": "2026-09-11", "confidence": "high",
             "line_items": [{"name": "Coke", "quantity": 2, "unit_price": 15.0}]}
    draft.update(kw)
    return draft


def test_shop_tally_rings_up_sale(db, sent, monkeypatch):
    _profile(db)
    biz = _business(db)
    coke = _product(db, biz.id)
    monkeypatch.setattr(cap, "classify_text", lambda text, slugs: _sheet())

    router._handle_message(db, SENDER, {"type": "text", "text": {"body": "coke x2"}})

    sale = db.query(Order).filter_by(business_id=biz.id, kind="sale").one()
    assert sale.status == "Completed"
    assert sale.reference == "#SW-1001"
    assert float(sale.amount_total) == 30.0
    db.refresh(coke)
    assert coke.stock == 8
    assert sent and "Rung up #SW-1001" in sent[-1][1]
    assert "K 30.00" in sent[-1][1]


def test_shop_tally_autocreates_unknown_product(db, sent, monkeypatch):
    _profile(db)
    biz = _business(db)
    monkeypatch.setattr(cap, "classify_text", lambda text, slugs: _sheet(
        line_items=[{"name": "Mystery Bun", "quantity": 3, "unit_price": 7.0}]))

    router._handle_message(db, SENDER, {"type": "text", "text": {"body": "buns"}})

    bun = db.query(Product).filter_by(business_id=biz.id, name="Mystery Bun").one()
    assert bun.stock == 0
    assert "New on the shelf: Mystery Bun" in sent[-1][1]
    assert "cost price" in sent[-1][1]


def test_shop_tally_without_lines_asks_for_resend(db, sent, monkeypatch):
    _profile(db)
    _business(db)
    monkeypatch.setattr(cap, "classify_text", lambda text, slugs: _sheet(line_items=None))

    router._handle_message(db, SENDER, {"type": "text", "text": {"body": "sold stuff"}})

    assert db.query(Order).count() == 0
    assert "couldn't make out any items" in sent[-1][1]


def test_shop_supplier_note_files_unpaid_expense(db, sent, monkeypatch):
    _profile(db)
    biz = _business(db)
    monkeypatch.setattr(cap, "classify_text", lambda text, slugs: {
        "kind": "supplier_note", "party": "Zambeef", "amount": 500.0,
        "occurred_on": "2026-09-11", "confidence": "high",
    })

    router._handle_message(db, SENDER, {"type": "text", "text": {"body": "invoice"}})

    row = db.query(LedgerEntry).filter_by(business_id=biz.id).one()
    assert row.source == "shop_expense"
    assert (row.raw or {}).get("paid") == "Unpaid"
    assert "unpaid expense" in sent[-1][1]


def test_shop_tally_over_threshold_is_held_not_filed(db, sent, monkeypatch):
    """Finding #5 of the security review: an unusually large auto-read
    amount is held back for the owner to confirm in the app, rather than
    filed straight into Sales off a single AI read of a photo/text."""
    _profile(db)
    _business(db)
    monkeypatch.setattr(cap, "classify_text", lambda text, slugs: _sheet(
        line_items=[{"name": "Coke", "quantity": 500, "unit_price": 15.0}]))  # K7,500

    router._handle_message(db, SENDER, {"type": "text", "text": {"body": "coke x500"}})

    assert db.query(Order).count() == 0
    assert "held it back" in sent[-1][1]
    assert "K7,500" in sent[-1][1]


def test_shop_supplier_note_over_threshold_is_held_not_filed(db, sent, monkeypatch):
    _profile(db)
    monkeypatch.setattr(cap, "classify_text", lambda text, slugs: {
        "kind": "supplier_note", "party": "Zambeef", "amount": 9000.0,
        "occurred_on": "2026-09-11", "confidence": "high",
    })

    router._handle_message(db, SENDER, {"type": "text", "text": {"body": "invoice"}})

    assert db.query(LedgerEntry).count() == 0
    assert "held it back" in sent[-1][1]
    assert "K9,000" in sent[-1][1]


def test_shop_personal_receipt_is_refused(db, sent, monkeypatch):
    _profile(db)
    _business(db)
    monkeypatch.setattr(cap, "classify_text", lambda text, slugs: {
        "kind": "receipt", "party": "Hungry Lion", "amount": 45.0,
        "confidence": "high",
    })

    router._handle_message(db, SENDER, {"type": "text", "text": {"body": "lunch 45"}})

    assert db.query(Order).count() == 0
    assert db.query(LedgerEntry).count() == 0
    assert "personal spending" in sent[-1][1]


def test_shop_image_tally_rings_up_sale(db, sent, monkeypatch):
    _profile(db)
    biz = _business(db)
    _product(db, biz.id)
    monkeypatch.setattr(router, "download_media", lambda media_id: (_photo(), "image/jpeg"))
    monkeypatch.setattr(cap, "classify_image", lambda blob, slugs: _sheet())

    router._handle_message(db, SENDER, {"type": "image", "image": {"id": "m1"}})

    assert db.query(Order).filter_by(business_id=biz.id).count() == 1
    assert "Rung up #SW-1001" in sent[-1][1]


def test_shop_link_welcome_names_the_tally(db, sent):
    from datetime import datetime, timedelta

    p = _profile(db, whatsapp_number=None)
    p.whatsapp_link_code = "123456"
    p.whatsapp_link_code_expires = datetime.utcnow() + timedelta(minutes=5)
    db.commit()

    router._handle_message(db, SENDER, {"type": "text", "text": {"body": "123456"}})

    assert "ring it up" in sent[-1][1]