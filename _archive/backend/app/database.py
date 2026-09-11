import os
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

if settings.database_url.startswith("sqlite"):
    os.makedirs("./data", exist_ok=True)

# check_same_thread=False is needed because FastAPI's threadpool hands sync
# route functions to different worker threads.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app import models  # noqa: F401  (ensures models are registered)
    try:
        Base.metadata.create_all(bind=engine)
        _ensure_columns()
    except OperationalError as e:
        # Harmless race if another process/worker created the tables in the
        # gap between create_all's existence check and its CREATE TABLE
        # (e.g. --workers > 1 starting up at the same time). Anything else
        # is a real problem and should still surface.
        if "already exists" not in str(e):
            raise

    # Seed/heal the frozen v1 taxonomy (idempotent — safe on every boot).
    db = SessionLocal()
    try:
        seed_categories(db)
    finally:
        db.close()

    # Backfill receipts → ledger (idempotent — reruns only copy new rows).
    # Runs on boot so every environment heals itself without an operator
    # remembering a script. Never crashes the boot: a mismatch is logged
    # loudly and the shadow-diff job (Phase 8) keeps watch.
    import logging as _logging
    try:
        from app.ledger_backfill import backfill_receipts, verify
        db = SessionLocal()
        try:
            backfill_receipts(db)
            verify(db)
        finally:
            db.close()
    except Exception:
        _logging.exception("ledger backfill/verify failed on boot — investigate, app still starting")


def _ensure_columns() -> None:
    """Adds columns that create_all can't (it only creates missing TABLES,
    never alters existing ones). Idempotent — safe on every boot, on both
    Postgres (production) and SQLite (dev/tests). No alembic: the list is
    short and explicit, which beats a migration framework for this size."""
    from sqlalchemy import text as sql_text

    is_sqlite = settings.database_url.startswith("sqlite")
    # (table, column, ddl-type)
    columns = [
        ("categories", "kinds", "JSON"),
        ("reports", "scope", "VARCHAR DEFAULT 'personal'"),
        ("reports", "business_id", "VARCHAR"),
        # Insurance for the earlier ledger-step columns — harmless if present.
        ("receipts", "direction", "VARCHAR DEFAULT 'out'"),
        ("receipts", "business_id", "VARCHAR"),
        ("receipts", "line_items", "JSON"),
    ]
    with engine.begin() as conn:
        for table, column, ddl in columns:
            if is_sqlite:
                have = {r[1] for r in conn.execute(sql_text(f"PRAGMA table_info({table})"))}
                if column not in have:
                    conn.execute(sql_text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            else:
                conn.execute(sql_text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}"))


# (name, slug, icon, kinds) — the frozen v1 taxonomy. Source of truth for
# the classifier's enum and the context-flip remap. Change only with a
# deliberate taxonomy version bump + migration, never casually.
FROZEN_TAXONOMY: list[tuple[str, str, str, list[str]]] = [
    ("Meals & Food", "meals", "🍔", ["personal", "expense"]),
    ("Fuel & Transport", "fuel-transport", "⛽", ["personal", "expense"]),
    ("Supplies", "supplies", "📦", ["personal", "expense"]),
    ("Equipment", "equipment", "🛠️", ["personal", "expense"]),
    ("Utilities", "utilities", "💡", ["personal", "expense"]),
    ("Rent", "rent", "🏠", ["personal", "expense"]),
    ("Payroll", "payroll", "🧾", ["expense"]),
    ("Marketing", "marketing", "📣", ["expense"]),
    ("Shipping", "shipping", "🚚", ["expense"]),
    ("Software & Subs", "software", "💻", ["personal", "expense"]),
    ("Accessories", "accessories", "🎒", ["personal"]),
    ("Beverages", "beverages", "🥤", ["shop"]),
    ("Pantry", "pantry", "🫙", ["shop"]),
    ("Fresh & Dairy", "fresh-dairy", "🥛", ["shop"]),
    ("Snacks", "snacks", "🍿", ["shop"]),
    ("Personal Care", "personal-care", "🧴", ["shop"]),
    ("Household", "household", "🧹", ["shop"]),
    ("Other", "other", "📎", ["personal", "shop", "expense"]),
]


def seed_categories(db) -> None:
    """Upserts the frozen taxonomy by slug: inserts missing rows, heals
    name/icon/kinds on existing ones (pre-Phase-1 rows have no kinds).
    Never deletes — unknown rows are left alone, never destroyed."""
    from app.models import Category

    existing = {c.slug: c for c in db.query(Category).all()}
    changed = False
    for name, slug, icon, kinds in FROZEN_TAXONOMY:
        row = existing.get(slug)
        if row is None:
            db.add(Category(name=name, slug=slug, icon=icon, is_default=True, kinds=kinds))
            changed = True
        elif row.name != name or row.icon != icon or (row.kinds or []) != kinds:
            row.name, row.icon, row.kinds = name, icon, kinds
            changed = True
    if changed:
        db.commit()
