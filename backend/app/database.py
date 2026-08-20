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
    except OperationalError as e:
        # Harmless race if another process/worker created the tables in the
        # gap between create_all's existence check and its CREATE TABLE
        # (e.g. --workers > 1 starting up at the same time). Anything else
        # is a real problem and should still surface.
        if "already exists" not in str(e):
            raise

    # Seed default categories once
    from app.models import Category
    db = SessionLocal()
    try:
        if db.query(Category).count() == 0:
            defaults = [
                ("Fuel & Transport", "fuel-transport", "⛽"),
                ("Meals & Food", "meals", "🍔"),
                ("Supplies", "supplies", "📦"),
                ("Equipment", "equipment", "🛠️"),
                ("Accessories", "accessories", "🎒"),
                ("Software & Subs", "software", "💻"),
                ("Other", "other", "📎"),
            ]
            for name, slug, icon in defaults:
                db.add(Category(name=name, slug=slug, icon=icon, is_default=True))
            db.commit()
    finally:
        db.close()
