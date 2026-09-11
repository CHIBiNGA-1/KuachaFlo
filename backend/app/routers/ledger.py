"""The unified ledger: every money movement, one timeline.

Reads/writes app.models.LedgerEntry (NOT receipts — that table is a
migration shadow as of Phase 1; see app/ledger_backfill.py).
"""

import base64
import json
from datetime import date as date_type, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.memory import remember
from app.models import Business, Category, LedgerEntry, User
from app.schemas import (
    CategoryNested,
    LedgerCreate,
    LedgerEntryOut,
    LedgerPage,
    LedgerUpdate,
)

router = APIRouter(prefix="/api/v1/ledger", tags=["ledger"])

# Sort key for entries without a date: they surface first, consistently on
# both SQLite and Postgres (which otherwise disagree on NULL ordering).
_SENTINEL_DATE = date_type(9999, 12, 31)
_MAX_LIMIT = 200


def _cat_nested(cat: Category | None) -> CategoryNested | None:
    if cat is None:
        return None
    return CategoryNested(id=cat.id, name=cat.name, slug=cat.slug, icon=cat.icon)


def _out(entry: LedgerEntry, cat: Category | None) -> LedgerEntryOut:
    return LedgerEntryOut(
        id=entry.id,
        context="business" if entry.business_id else "personal",
        direction=entry.direction,
        party=entry.party,
        amount=float(entry.amount) if entry.amount is not None else None,
        currency=entry.currency,
        occurred_on=entry.occurred_on,
        category=_cat_nested(cat),
        note=entry.note,
        source=entry.source,
        status=entry.status,
        confidence=entry.confidence,
        image_path=entry.image_path,
        thumbnail_path=entry.thumbnail_path,
        line_items=entry.line_items,
        order_ref=None,  # Phase 3 resolves this via order_id
        business_id=entry.business_id,
        created_at=entry.created_at,
    )


def _encode_cursor(entry: LedgerEntry) -> str:
    raw = json.dumps({
        "d": (entry.occurred_on or _SENTINEL_DATE).isoformat(),
        "c": entry.created_at.isoformat(),
        "i": entry.id,
    }).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[date_type, datetime, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded).decode())
        return (
            date_type.fromisoformat(data["d"]),
            datetime.fromisoformat(data["c"]),
            str(data["i"]),
        )
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(400, "Invalid cursor — drop it and page from the start.")


def _base_query(db: Session, user: User, context: str):
    q = db.query(LedgerEntry).filter(
        LedgerEntry.user_id == user.id,
        LedgerEntry.is_deleted == False,  # noqa: E712
    )
    if context == "personal":
        q = q.filter(LedgerEntry.business_id.is_(None))
    elif context == "business":
        q = q.filter(LedgerEntry.business_id.isnot(None))
    return q


@router.get("", response_model=LedgerPage)
def get_ledger(
    context: Literal["all", "personal", "business"] = Query("all"),
    from_: Optional[date_type] = Query(None, alias="from"),
    to: Optional[date_type] = Query(None, alias="to"),
    q: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    needs_review: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=_MAX_LIMIT),
    cursor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """One timeline: personal receipts and shop money side by side, newest
    first, keyset-paginated. Filters compose."""
    query = _base_query(db, user, context)
    if from_ is not None:
        query = query.filter(LedgerEntry.occurred_on >= from_)
    if to is not None:
        query = query.filter(LedgerEntry.occurred_on <= to)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            LedgerEntry.party.ilike(like),
            LedgerEntry.note.ilike(like),
        ))
    if category_id:
        query = query.filter(LedgerEntry.category_id == category_id)
    if needs_review is not None:
        query = query.filter(
            LedgerEntry.status == "needs_review" if needs_review
            else LedgerEntry.status != "needs_review"
        )

    effective_date = func.coalesce(LedgerEntry.occurred_on, _SENTINEL_DATE)
    if cursor:
        d, c, i = _decode_cursor(cursor)
        query = query.filter(or_(
            effective_date < d,
            and_(effective_date == d, LedgerEntry.created_at < c),
            and_(effective_date == d, LedgerEntry.created_at == c, LedgerEntry.id < i),
        ))

    rows = (
        query.order_by(effective_date.desc(), LedgerEntry.created_at.desc(), LedgerEntry.id.desc())
        .limit(limit + 1)
        .all()
    )

    cats = {c.id: c for c in db.query(Category).all()}
    page = rows[:limit]
    return LedgerPage(
        items=[_out(e, cats.get(e.category_id)) for e in page],
        next_cursor=_encode_cursor(page[-1]) if len(rows) > limit else None,
    )


@router.get("/summary")
def get_ledger_summary(
    context: Literal["all", "personal", "business"] = Query("all"),
    from_: Optional[date_type] = Query(None, alias="from"),
    to: Optional[date_type] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Combined totals for the Home room: personal in/out, business
    in/out, net, category + month breakdowns, review count."""
    query = _base_query(db, user, context)
    if from_ is not None:
        query = query.filter(LedgerEntry.occurred_on >= from_)
    if to is not None:
        query = query.filter(LedgerEntry.occurred_on <= to)
    entries = query.all()

    cats = {c.id: c for c in db.query(Category).all()}
    personal_in = personal_out = business_in = business_out = 0.0
    needs_review_count = 0
    by_cat: dict[str, dict] = {}
    by_month: dict[str, dict] = {}

    for e in entries:
        amt = float(e.amount or 0)
        shop = e.business_id is not None
        if e.direction == "in":
            if shop:
                business_in += amt
            else:
                personal_in += amt
        else:
            if shop:
                business_out += amt
            else:
                personal_out += amt
        if e.status == "needs_review":
            needs_review_count += 1

        cat = cats.get(e.category_id) if e.category_id else None
        slug = cat.slug if cat else "uncategorised"
        bucket = by_cat.setdefault(slug, {
            "slug": slug,
            "name": cat.name if cat else "Uncategorised",
            "amount": 0.0, "count": 0,
        })
        bucket["amount"] += amt
        bucket["count"] += 1

        if e.occurred_on:
            month = e.occurred_on.strftime("%Y-%m")
            m = by_month.setdefault(month, {"month": month, "in": 0.0, "out": 0.0, "net": 0.0})
            m["in" if e.direction == "in" else "out"] += amt
            m["net"] = m["in"] - m["out"]

    has_business = (
        db.query(Business).filter(Business.owner_user_id == user.id).first() is not None
    )
    return {
        "personal_in": personal_in,
        "personal_out": personal_out,
        "business_in": business_in,
        "business_out": business_out,
        "net": personal_in - personal_out + business_in - business_out,
        "needs_review_count": needs_review_count,
        "has_business": has_business,
        "by_category": sorted(by_cat.values(), key=lambda b: -b["amount"]),
        "by_month": sorted(by_month.values(), key=lambda m: m["month"], reverse=True),
    }


def _require_category(db: Session, category_id: str | None) -> Category | None:
    if category_id is None:
        return None
    cat = db.query(Category).filter(Category.id == category_id).first()
    if cat is None:
        raise HTTPException(422, "Unknown category_id — pick one from /api/v1/categories.")
    return cat


def _require_business(db: Session, user: User) -> Business:
    business = db.query(Business).filter(Business.owner_user_id == user.id).first()
    if business is None:
        raise HTTPException(422, "Start your shop first — then business entries have a home.")
    return business


def _category_valid_for(cat: Category, context: str) -> bool:
    # Pre-Phase-1 rows have kinds NULL — those were all personal-world
    # categories, so NULL means personal-only. Honest default, not lax.
    kinds = set(cat.kinds or ["personal"])
    if context == "personal":
        return "personal" in kinds
    return bool(kinds & {"shop", "expense"})


@router.post("", response_model=LedgerEntryOut, status_code=201)
def create_entry(
    payload: LedgerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.party.strip():
        raise HTTPException(422, "party is required.")
    if not payload.amount > 0:
        raise HTTPException(422, "amount must be greater than zero.")
    cat = _require_category(db, payload.category_id)

    business_id = None
    if payload.context == "business":
        business_id = _require_business(db, user).id

    entry = LedgerEntry(
        user_id=user.id,
        business_id=business_id,
        direction=payload.direction,
        amount=payload.amount,
        currency=payload.currency or user.currency or "ZMW",
        party=payload.party.strip(),
        category_id=cat.id if cat else None,
        occurred_on=payload.occurred_on or datetime.utcnow().date(),
        note=payload.note,
        source="app_manual",
        status="processed",
        confidence="high",  # a human typed it — certain by construction
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _out(entry, cat)


@router.patch("/{entry_id}", response_model=LedgerEntryOut)
def update_entry(
    entry_id: str,
    payload: LedgerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.id == entry_id, LedgerEntry.user_id == user.id,
                LedgerEntry.is_deleted == False)  # noqa: E712
        .first()
    )
    if entry is None:
        raise HTTPException(404, "Entry not found")

    data = payload.model_dump(exclude_unset=True)
    if "party" in data:
        if not (data["party"] or "").strip():
            raise HTTPException(422, "party can't be blank.")
        entry.party = data["party"].strip()
    if "amount" in data:
        if data["amount"] is None or not data["amount"] > 0:
            raise HTTPException(422, "amount must be greater than zero.")
        entry.amount = data["amount"]
    if "direction" in data and data["direction"] is not None:
        entry.direction = data["direction"]
    if "occurred_on" in data and data["occurred_on"] is not None:
        entry.occurred_on = data["occurred_on"]
    if "note" in data:
        entry.note = data["note"]

    remapped = False
    target_context = data.get("context")
    if target_context == "business" and entry.business_id is None:
        entry.business_id = _require_business(db, user).id
    elif target_context == "personal" and entry.business_id is not None:
        entry.business_id = None

    if "category_id" in data:
        cat = _require_category(db, data["category_id"])
        entry.category_id = cat.id if cat else None

    # A context flip can strand the category (personal-only category on a
    # business entry or vice versa) — fall back to Other and say so
    # honestly via needs_review rather than silently keeping a lie.
    if target_context is not None and entry.category_id is not None:
        cat = db.query(Category).filter(Category.id == entry.category_id).first()
        if cat is not None and not _category_valid_for(cat, target_context):
            other = db.query(Category).filter(Category.slug == "other").first()
            entry.category_id = other.id if other else None
            entry.status = "needs_review"
            remapped = True

    if not remapped and entry.party and entry.amount:
        entry.status = "processed"

    db.commit()
    db.refresh(entry)

    # The product learns from every correction — this is what makes it ask
    # once and never twice.
    if "category_id" in data or target_context is not None:
        remember(
            db, user.id, entry.party or "",
            category_id=entry.category_id,
            context="business" if entry.business_id else "personal",
        )

    cats = {c.id: c for c in db.query(Category).all()}
    return _out(entry, cats.get(entry.category_id))


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.id == entry_id, LedgerEntry.user_id == user.id,
                LedgerEntry.is_deleted == False)  # noqa: E712
        .first()
    )
    if entry is None:
        raise HTTPException(404, "Entry not found")
    entry.is_deleted = True  # soft delete — history is sacred
    db.commit()
