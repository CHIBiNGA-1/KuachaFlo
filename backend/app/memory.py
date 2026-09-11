"""The nerves: learn from corrections so the product asks once, never twice.

Keys are per-user, normalized strings:
  - "merchant:<name>" for named parties ("Hungry Lion" → "merchant:hungry lion")
  - "counterparty:<digits>" for phone-like parties ("097XXXXXXX" → "counterparty:097xxxxxxx")

Ingestion consults lookup() before asking the user anything; a hit with a
category means file silently. Every correction (PATCH category/context) and
every answered clarification question calls remember().
"""

import re

from sqlalchemy.orm import Session

from app.models import Memory

_PHONE_LIKE = re.compile(r"(?:\+?\d[\s\-.]*){7,}")


def normalize_party(party: str) -> str:
    return re.sub(r"\s+", " ", (party or "").strip().lower())


def memory_key(party: str) -> str | None:
    norm = normalize_party(party)
    if not norm:
        return None
    digits = re.sub(r"\D", "", norm)
    if len(digits) >= 7 and len(digits) >= len(norm.replace(" ", "")) * 0.5:
        return f"counterparty:{norm}"
    return f"merchant:{norm}"


def remember(
    db: Session,
    user_id: str,
    party: str,
    category_id: str | None = None,
    context: str | None = None,
) -> Memory | None:
    """Upserts the learned rule for this party. Returns None when there's
    nothing worth remembering (empty party and no category/context)."""
    key = memory_key(party)
    if key is None and not (category_id or context):
        return None
    if key is None:
        return None

    mem = (
        db.query(Memory)
        .filter(Memory.user_id == user_id, Memory.key == key)
        .first()
    )
    if mem is None:
        mem = Memory(
            user_id=user_id, key=key, party_display=(party or "").strip() or None,
            category_id=category_id, context=context, hits=1,
        )
        db.add(mem)
    else:
        if category_id is not None:
            mem.category_id = category_id
        if context is not None:
            mem.context = context
        if (party or "").strip():
            mem.party_display = party.strip()
        mem.hits = (mem.hits or 0) + 1
    db.commit()
    db.refresh(mem)
    return mem


def lookup(db: Session, user_id: str, party: str) -> Memory | None:
    key = memory_key(party)
    if key is None:
        return None
    return (
        db.query(Memory)
        .filter(Memory.user_id == user_id, Memory.key == key)
        .first()
    )
