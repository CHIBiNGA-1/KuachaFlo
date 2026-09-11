"""The receipts → ledger_entries migration must be lossless and rerunnable."""

import json
import uuid
from datetime import date

from app.ledger_backfill import backfill_receipts, verify


def _receipt(db, user, **over):
    from app.models import Receipt
    kw = dict(
        id=str(uuid.uuid4()), user_id=user.id, merchant="Shoprite",
        total_amount=100.0, currency="ZMW", purchase_date=date(2026, 8, 20),
        source="app", status="processed", confidence="high", direction="out",
    )
    kw.update(over)
    r = Receipt(**kw)
    db.add(r)
    db.commit()
    return r


def test_backfill_copies_and_preserves_ids(db, user, seed_categories):
    from app.models import LedgerEntry
    r = _receipt(db, user, category_id=seed_categories["meals"].id)
    report = backfill_receipts(db)
    assert report == {"copied": 1, "skipped": 0, "fixed_direction": 0}

    e = db.query(LedgerEntry).filter(LedgerEntry.id == r.id).one()
    assert (e.party, float(e.amount), e.occurred_on) == ("Shoprite", 100.0, date(2026, 8, 20))
    assert e.source == "app_photo"
    assert e.business_id is None and e.is_deleted is False


def test_backfill_fixes_momo_received_direction(db, user):
    from app.models import LedgerEntry
    raw = json.dumps({"direction": "received", "counterparty": "Bwalya", "amount": 250})
    _receipt(db, user, merchant="Bwalya", total_amount=250,
             source="whatsapp_momo_sms", raw_ocr_text=raw, direction="out")
    report = backfill_receipts(db)
    assert report["fixed_direction"] == 1
    e = db.query(LedgerEntry).all()[0]
    assert e.direction == "in"
    assert e.source == "whatsapp_momo_text"
    assert e.raw_extraction["counterparty"] == "Bwalya"


def test_backfill_rescues_business_note_and_tax(db, user, business):
    from app.models import LedgerEntry
    _receipt(db, user, merchant="Supplier", total_amount=500, tax_amount=60,
             source="business_manual", business_id=business.id,
             raw_ocr_text="paid cash, no receipt", direction="out")
    backfill_receipts(db)
    e = db.query(LedgerEntry).all()[0]
    assert e.note == "paid cash, no receipt"
    assert e.raw_extraction["legacy_tax_amount"] == 60.0
    assert e.business_id == business.id
    assert e.source == "shop_manual"


def test_backfill_is_idempotent(db, user):
    _receipt(db, user)
    assert backfill_receipts(db)["copied"] == 1
    second = backfill_receipts(db)
    assert (second["copied"], second["skipped"]) == (0, 1)


def test_verify_passes_after_backfill_and_counts_match(db, user):
    from app.models import LedgerEntry
    _receipt(db, user, total_amount=100)
    _receipt(db, user, merchant="Gone", total_amount=999, is_deleted=True)
    backfill_receipts(db)
    report = verify(db)
    assert report["receipt_rows"] == 1
    assert db.query(LedgerEntry).count() == 2  # deleted rows migrate too (as deleted)
