"""One-shot (+ rerunnable) migration: receipts → ledger_entries.

Idempotent: rows keep their receipt id, and existing ids are skipped, so
rerunning after new receipts arrive only backfills the new ones. Run via:

    python scripts/backfill_ledger.py            # migrate + verify
    python scripts/backfill_ledger.py --verify   # verify only

Fixes one historical data bug on the way: MoMo "received"/"deposit"
texts were stored with direction='out' (receipt_service never mapped the
extracted direction onto the row). The backfill recovers the true
direction from the stored raw_ocr_text JSON.
"""

import json
import logging

from sqlalchemy.orm import Session

from app.models import Receipt, LedgerEntry

log = logging.getLogger(__name__)

SOURCE_MAP = {
    "app": "app_photo",
    "whatsapp_photo": "whatsapp_photo",
    "whatsapp_momo_sms": "whatsapp_momo_text",
    "business_manual": "shop_manual",
}

_MOMO_IN = {"received", "deposit"}


def _parse_raw(raw: str | None) -> tuple[dict | None, str | None]:
    """Returns (parsed_json_or_None, plain_text_or_None)."""
    if not raw:
        return None, None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None, None
    except (ValueError, TypeError):
        return None, raw


def backfill_receipts(db: Session) -> dict:
    """Copies every receipt row without a ledger twin. Returns a report."""
    existing_ids = {r[0] for r in db.query(LedgerEntry.id).all()}
    receipts = db.query(Receipt).order_by(Receipt.created_at).all()

    copied = skipped = fixed_direction = 0
    for r in receipts:
        if r.id in existing_ids:
            skipped += 1
            continue

        parsed, plain = _parse_raw(r.raw_ocr_text)
        direction = r.direction or "out"
        if parsed and isinstance(parsed.get("direction"), str):
            if parsed["direction"] in _MOMO_IN and direction != "in":
                direction = "in"
                fixed_direction += 1

        # Business-manual rows stashed the human note in raw_ocr_text as
        # plain text — rescue it into the real note field.
        note = plain if (r.source == "business_manual" and plain) else None
        raw_extraction = parsed
        if raw_extraction is None and (plain or r.tax_amount is not None):
            raw_extraction = {
                "legacy_text": plain,
                "legacy_tax_amount": float(r.tax_amount) if r.tax_amount is not None else None,
                "legacy_source": r.source,
            }

        db.add(LedgerEntry(
            id=r.id,  # stable ids: reruns skip, references survive
            user_id=r.user_id,
            business_id=r.business_id,
            direction=direction,
            amount=r.total_amount,
            currency=r.currency or "ZMW",
            party=r.merchant,
            category_id=r.category_id,
            occurred_on=r.purchase_date or (r.created_at.date() if r.created_at else None),
            note=note,
            source=SOURCE_MAP.get(r.source, "legacy_receipt"),
            image_path=r.image_path,
            thumbnail_path=r.thumbnail_path,
            raw_extraction=raw_extraction,
            status=r.status or "processed",
            confidence=r.confidence,
            line_items=r.line_items,
            is_deleted=bool(r.is_deleted),
            created_at=r.created_at,
            updated_at=r.updated_at,
        ))
        copied += 1

    db.commit()
    report = {"copied": copied, "skipped": skipped, "fixed_direction": fixed_direction}
    log.warning("ledger backfill: %s", report)
    return report


def verify(db: Session) -> dict:
    """Reconciles receipts vs ledger. Raises AssertionError on mismatch."""
    from sqlalchemy import func

    def _sums(model, id_col, user_col, amt_col, del_col):
        rows = (
            db.query(user_col, func.count(id_col), func.coalesce(func.sum(amt_col), 0))
            .filter(del_col == False)  # noqa: E712
            .group_by(user_col)
            .all()
        )
        return {u: (c, float(s)) for u, c, s in rows}

    want = _sums(Receipt, Receipt.id, Receipt.user_id, Receipt.total_amount, Receipt.is_deleted)
    got = _sums(LedgerEntry, LedgerEntry.id, LedgerEntry.user_id, LedgerEntry.amount, LedgerEntry.is_deleted)

    # Ledger may hold MORE (new native entries); it must never hold LESS
    # per user than receipts did, and every receipt id must exist there.
    receipt_ids = {r[0] for r in db.query(Receipt.id).all()}
    ledger_ids = {r[0] for r in db.query(LedgerEntry.id).all()}
    missing = receipt_ids - ledger_ids
    assert not missing, f"{len(missing)} receipt ids missing from ledger"

    short = {u: (want[u], got.get(u, (0, 0.0))) for u in want if got.get(u, (0, 0.0))[0] < want[u][0]}
    assert not short, f"ledger short for users: {short}"

    report = {"users": len(want), "receipt_rows": sum(c for c, _ in want.values()),
              "ledger_rows": sum(c for c, _ in got.values())}
    log.warning("ledger verify OK: %s", report)
    return report
