#!/usr/bin/env python3
"""Migrate receipts → ledger_entries (idempotent) and reconcile.

Usage (from backend/):
    ../.venv/bin/python ../scripts/backfill_ledger.py            # migrate + verify
    ../.venv/bin/python ../scripts/backfill_ledger.py --verify   # verify only

DATABASE_URL comes from the environment, same as the app.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.database import SessionLocal, init_db  # noqa: E402
from app.ledger_backfill import backfill_receipts, verify  # noqa: E402


def main() -> None:
    init_db()  # ensures tables + columns + taxonomy exist first
    db = SessionLocal()
    try:
        if "--verify" not in sys.argv:
            print(backfill_receipts(db), flush=True)
        print(verify(db), flush=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()
