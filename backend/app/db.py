"""Engine + sessions. On Postgres the supabase/*.sql files own the DDL —
init_db() only ever creates tables for sqlite dev/test databases, so a
missing migration can never silently produce policy-less tables.
"""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


_kwargs: dict = {}
if settings.database_url.startswith("sqlite"):
    _kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(settings.database_url, **_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    if settings.database_url.startswith("sqlite"):
        from app import models  # noqa: F401 — register tables

        if ":memory:" not in settings.database_url:
            db_file = settings.database_url.split("///")[-1]
            Path(db_file).parent.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(engine)