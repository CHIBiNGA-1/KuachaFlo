"""Contract tests for the frozen v1 category taxonomy (BUILD_LOG Phase 0).

The app's own seed (app.database.seed_categories) is the source of truth;
these tests pin it so no one silently drifts the classifier's enum.
Phase 1 turns these green.
"""

FROZEN = {
    # slug: kinds
    "meals": {"personal", "expense"},
    "fuel-transport": {"personal", "expense"},
    "supplies": {"personal", "expense"},
    "equipment": {"personal", "expense"},
    "utilities": {"personal", "expense"},
    "rent": {"personal", "expense"},
    "payroll": {"expense"},
    "marketing": {"expense"},
    "shipping": {"expense"},
    "software": {"personal", "expense"},
    "accessories": {"personal"},
    "beverages": {"shop"},
    "pantry": {"shop"},
    "fresh-dairy": {"shop"},
    "snacks": {"shop"},
    "personal-care": {"shop"},
    "household": {"shop"},
    "other": {"personal", "shop", "expense"},
}


def test_seed_matches_frozen_taxonomy(db):
    from app.database import seed_categories

    seed_categories(db)
    from app.models import Category
    rows = db.query(Category).all()
    assert {r.slug for r in rows} == set(FROZEN.keys())
    for r in rows:
        assert set(r.kinds) == FROZEN[r.slug], r.slug


def test_seed_is_idempotent_and_heals_kinds(db):
    from app.database import seed_categories
    from app.models import Category

    # Simulate a pre-Phase-1 database: legacy 7 rows, no kinds.
    for slug in ("meals", "other"):
        db.add(Category(name=slug, slug=slug, icon="x"))
    db.commit()

    seed_categories(db)
    seed_categories(db)  # twice — must not duplicate
    rows = db.query(Category).all()
    assert {r.slug for r in rows} == set(FROZEN.keys())


def test_categories_endpoint_filters_by_kind(client, db):
    from app.database import seed_categories
    seed_categories(db)

    personal = {c["slug"] for c in client.get("/api/v1/categories?type=personal").json()}
    assert personal == {s for s, k in FROZEN.items() if "personal" in k}

    shop = {c["slug"] for c in client.get("/api/v1/categories?type=shop").json()}
    assert shop == {s for s, k in FROZEN.items() if "shop" in k}

    expense = {c["slug"] for c in client.get("/api/v1/categories?type=expense").json()}
    assert expense == {s for s, k in FROZEN.items() if "expense" in k}

    everything = client.get("/api/v1/categories").json()
    assert {c["slug"] for c in everything} == set(FROZEN.keys())
    assert all(set(c.keys()) >= {"id", "name", "slug", "icon", "kinds"} for c in everything)
