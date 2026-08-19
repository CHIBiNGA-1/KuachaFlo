from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.auth import verify_token, TokenInvalid


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """
    Verifies the Supabase session token sent as `Authorization: Bearer
    <token>` and looks up (or lazily creates, on first sign-in) the
    matching local User row, keyed by Supabase's stable `sub` claim.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        claims = verify_token(token)
    except TokenInvalid as e:
        raise HTTPException(401, str(e))

    supabase_uid = claims["sub"]
    email = claims.get("email") or f"{supabase_uid}@unknown"

    user = db.query(User).filter(User.supabase_uid == supabase_uid).first()
    if user is None:
        # First time we've seen this Supabase user — create the local
        # profile row. Falls back to matching by email in case a user
        # existed from an older auth scheme, so nobody loses their receipts.
        user = db.query(User).filter(User.email == email).first()
        if user is not None:
            user.supabase_uid = supabase_uid
        else:
            user = User(supabase_uid=supabase_uid, email=email)
            db.add(user)
        db.commit()
        db.refresh(user)
    elif user.email != email:
        # Keep email in sync if it changed on the Supabase side
        user.email = email
        db.commit()
        db.refresh(user)

    return user
