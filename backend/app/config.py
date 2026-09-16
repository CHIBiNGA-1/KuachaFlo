"""App settings, read from the environment (.env locally, real env vars in
production). Every optional integration degrades gracefully when its keys
are blank — the app runs with just DATABASE_URL and SUPABASE_URL set.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres in production (Supabase/Render), sqlite file for local dev.
    database_url: str = "sqlite:///./data/app.db"

    # Gemini powers the optional WhatsApp sales-sheet capture (app/classify.py,
    # app/shop_capture.py). Blank key just means that pipeline stays dormant.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    supabase_url: str = ""
    supabase_service_role_key: str = ""  # storage uploads only, never leaves the server
    supabase_jwks_url: str = ""  # blank = derived from supabase_url in auth.py

    # Comma-separated; "*" default keeps Bearer-auth calls working from any
    # origin (Vercel, previews). Tighten in production if you like.
    allowed_origins: str = "*"

    plan_limits: dict[str, int | None] = {"free": 100, "pro": 1000, "business": None}
    max_upload_mb: int = 10

    # Shared secret for the /api/v1/admin API. Anyone with this key can
    # grant paid plans — treat it like a password.
    admin_api_key: str = ""

    # Optional: pings your Telegram the moment someone submits a MoMo
    # payment reference, so you don't have to poll the admin API.
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # WhatsApp Cloud API — lets a shop owner text a day-sales tally or a
    # till-roll photo straight to a WhatsApp number instead of opening the
    # app. All five come from a Meta for Developers app (WhatsApp product):
    # verify_token is one you make up; the rest Meta issues.
    whatsapp_verify_token: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_display_number: str = ""


settings = Settings()
