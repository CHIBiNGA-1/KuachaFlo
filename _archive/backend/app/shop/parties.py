"""Customers / suppliers / team CRUD (straight ports, strict validation)."""

from sqlalchemy.orm import Session

from app.models import Customer, Supplier, TeamMember
from app.shop import validate as v
from app.shop.errors import NotFound
from app.shop.money import money_value

CUSTOMER_ALLOWED = {"name", "company", "email", "phone", "channel", "balance", "address", "notes"}
SUPPLIER_ALLOWED = {"name", "company", "contact_person", "email", "phone", "category", "status", "address", "notes"}
TEAM_ALLOWED = {"name", "email", "role", "status", "phone", "notes"}


def serialize_customer(c: Customer) -> dict:
    return {"id": c.id, "name": c.name, "company": c.company or "", "email": c.email or "",
            "phone": c.phone or "", "channel": c.channel,
            "balance": float(c.balance_opening or 0), "address": c.address or "",
            "notes": c.notes or ""}


def serialize_supplier(s: Supplier) -> dict:
    return {"id": s.id, "name": s.name, "contact_person": s.contact_person or "",
            "company": s.contact_person or "", "email": s.email or "",
            "phone": s.phone or "", "category": s.category or "",
            "status": s.status, "address": s.address or "", "notes": s.notes or ""}


def serialize_team(t: TeamMember) -> dict:
    return {"id": t.id, "name": t.name, "email": t.email or "", "role": t.role,
            "status": t.status, "phone": t.phone or "", "notes": t.notes or ""}


def create_customer(db: Session, business_id: str, payload: dict) -> Customer:
    v.allowed_keys(payload, sorted(CUSTOMER_ALLOWED))
    row = Customer(
        business_id=business_id,
        name=v.text(payload.get("name"), "Full name", min_len=1, max_len=500, required=True),
        company=v.text(payload.get("company"), "Business name", max_len=500) or None,
        email=v.email(payload.get("email"), required=True),
        phone=v.text(payload.get("phone"), "Phone number", max_len=100) or None,
        channel=v.choice(payload.get("channel"), v.CUSTOMER_TYPES, "Customer type"),
        balance_opening=money_value(payload.get("balance", 0), "Opening balance"),
        address=v.text(payload.get("address"), "Address", max_len=500) or None,
        notes=v.text(payload.get("notes"), "Notes", max_len=2000) or None,
    )
    db.add(row)
    db.flush()
    return row


def create_supplier(db: Session, business_id: str, payload: dict) -> Supplier:
    v.allowed_keys(payload, sorted(SUPPLIER_ALLOWED))
    contact = payload.get("contact_person", payload.get("company"))
    row = Supplier(
        business_id=business_id,
        name=v.text(payload.get("name"), "Supplier name", min_len=1, max_len=500, required=True),
        contact_person=v.text(contact, "Contact person", min_len=1, max_len=500, required=True),
        email=v.email(payload.get("email"), required=True),
        phone=v.text(payload.get("phone"), "Phone number", max_len=100) or None,
        category=v.choice(payload.get("category"), v.SUPPLIER_CATEGORIES, "Product category",
                          fallback="Other") if payload.get("category") else "Other",
        status=v.choice(payload.get("status"), v.PARTY_STATUSES, "Status", fallback="Active"),
        address=v.text(payload.get("address"), "Business address", max_len=500) or None,
        notes=v.text(payload.get("notes"), "Notes", max_len=2000) or None,
    )
    db.add(row)
    db.flush()
    return row


def create_team_member(db: Session, business_id: str, payload: dict) -> TeamMember:
    v.allowed_keys(payload, sorted(TEAM_ALLOWED))
    row = TeamMember(
        business_id=business_id,
        name=v.text(payload.get("name"), "Full name", min_len=1, max_len=500, required=True),
        email=v.email(payload.get("email"), required=True),
        role=v.choice(payload.get("role"), v.TEAM_ROLES, "Role"),
        status=v.choice(payload.get("status"), v.TEAM_STATUSES, "Status", fallback="Active"),
        phone=v.text(payload.get("phone"), "Phone number", max_len=100) or None,
        notes=v.text(payload.get("notes"), "Notes", max_len=2000) or None,
    )
    db.add(row)
    db.flush()
    return row


def list_rows(db: Session, model, business_id: str, serialize) -> dict:
    rows = (
        db.query(model).filter(model.business_id == business_id)
        .order_by(model.name).limit(201).all()
    )
    return {"items": [serialize(r) for r in rows[:200]], "next_cursor": None}


def get_owned(db: Session, model, business_id: str, record_id: str, label: str):
    v.uuid_value(record_id, label)
    row = (
        db.query(model)
        .filter(model.id == record_id, model.business_id == business_id)
        .first()
    )
    if row is None:
        raise NotFound(f"This {label.lower()} no longer exists.")
    return row


def update_customer(db: Session, business_id: str, record_id: str, payload: dict) -> Customer:
    v.allowed_keys(payload, sorted(CUSTOMER_ALLOWED))
    row = get_owned(db, Customer, business_id, record_id, "Customer")
    if "name" in payload:
        row.name = v.text(payload["name"], "Full name", min_len=1, max_len=500, required=True)
    if "company" in payload:
        row.company = v.text(payload["company"], "Business name", max_len=500) or None
    if "email" in payload:
        row.email = v.email(payload["email"], required=True)
    if "phone" in payload:
        row.phone = v.text(payload["phone"], "Phone number", max_len=100) or None
    if "channel" in payload:
        row.channel = v.choice(payload["channel"], v.CUSTOMER_TYPES, "Customer type")
    if "balance" in payload:
        row.balance_opening = money_value(payload["balance"], "Opening balance")
    if "address" in payload:
        row.address = v.text(payload["address"], "Address", max_len=500) or None
    if "notes" in payload:
        row.notes = v.text(payload["notes"], "Notes", max_len=2000) or None
    db.flush()
    return row


def update_supplier(db: Session, business_id: str, record_id: str, payload: dict) -> Supplier:
    v.allowed_keys(payload, sorted(SUPPLIER_ALLOWED))
    row = get_owned(db, Supplier, business_id, record_id, "Supplier")
    if "name" in payload:
        row.name = v.text(payload["name"], "Supplier name", min_len=1, max_len=500, required=True)
    if "contact_person" in payload or "company" in payload:
        contact = payload.get("contact_person", payload.get("company"))
        row.contact_person = v.text(contact, "Contact person", min_len=1, max_len=500, required=True)
    if "email" in payload:
        row.email = v.email(payload["email"], required=True)
    if "phone" in payload:
        row.phone = v.text(payload["phone"], "Phone number", max_len=100) or None
    if "category" in payload:
        row.category = v.choice(payload["category"], v.SUPPLIER_CATEGORIES, "Product category")
    if "status" in payload:
        row.status = v.choice(payload["status"], v.PARTY_STATUSES, "Status")
    if "address" in payload:
        row.address = v.text(payload["address"], "Business address", max_len=500) or None
    if "notes" in payload:
        row.notes = v.text(payload["notes"], "Notes", max_len=2000) or None
    db.flush()
    return row


def update_team_member(db: Session, business_id: str, record_id: str, payload: dict) -> TeamMember:
    v.allowed_keys(payload, sorted(TEAM_ALLOWED))
    row = get_owned(db, TeamMember, business_id, record_id, "Team member")
    if "name" in payload:
        row.name = v.text(payload["name"], "Full name", min_len=1, max_len=500, required=True)
    if "email" in payload:
        row.email = v.email(payload["email"], required=True)
    if "role" in payload:
        row.role = v.choice(payload["role"], v.TEAM_ROLES, "Role")
    if "status" in payload:
        row.status = v.choice(payload["status"], v.TEAM_STATUSES, "Status")
    if "phone" in payload:
        row.phone = v.text(payload["phone"], "Phone number", max_len=100) or None
    if "notes" in payload:
        row.notes = v.text(payload["notes"], "Notes", max_len=2000) or None
    db.flush()
    return row


def delete_row(db: Session, model, business_id: str, record_id: str, label: str) -> None:
    db.delete(get_owned(db, model, business_id, record_id, label))
    db.flush()
