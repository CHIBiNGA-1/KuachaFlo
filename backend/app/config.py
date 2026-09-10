from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite by default — swap for a real Postgres URL (e.g. Supabase) when you go live
    database_url: str = "sqlite:///./data/kuachaflo.db"

    # Local disk by default — swap for Cloudinary/S3 when you go live
    upload_dir: str = "./uploads"

    # Generated PDF expense reports. Deliberately NOT under a public static
    # mount like /uploads — downloads go through an authenticated endpoint
    # instead (see routers/reports.py), since these contain a user's full
    # spending history in one file.
    reports_dir: str = "./reports"

    allowed_origins: str = "http://localhost:3000"

    # OCR + auto-categorization run through Gemini's API — get a free key
    # (no card) at https://aistudio.google.com/apikey
    gemini_api_key: str = ""
    # Check https://ai.google.dev/gemini-api/docs/models for the current
    # recommended free-tier flash model — Google renames/retires these
    # every few months. Override via env without touching code.
    gemini_model: str = "gemini-2.5-flash"

    # Supabase Auth. We verify the user's JWT ourselves via Supabase's public
    # JWKS endpoint — this needs only the project URL, never the
    # service_role/secret key (that key bypasses RLS and should never touch
    # this app at all; nothing here reads it).
    supabase_url: str = ""

    # Service-role key — used ONLY server-side, ONLY to upload receipt
    # images/reports to Supabase Storage (bypasses RLS by design for that
    # one purpose). Never sent to the frontend, never logged.
    supabase_service_role_key: str = ""

    # Shared secret for the /admin dashboard and admin API. Anyone with this
    # key can grant paid plans — treat it like a password.
    admin_api_key: str = ""

    # Optional: pings your Telegram the moment someone submits a MoMo
    # payment reference, so you don't have to poll the admin dashboard.
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # WhatsApp Cloud API — lets users text a receipt photo straight to a
    # WhatsApp number instead of opening the app. All four come from a
    # Meta for Developers app (WhatsApp product): verify_token is one you
    # choose yourself, the rest come from the app dashboard.
    whatsapp_verify_token: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_display_number: str = ""  # human-readable, shown in-app for linking instructions

    # KraTte integration — lets the same WhatsApp number serve both apps.
    # A number linked to a KraTte account gets sales-sheet photo capture
    # instead of receipt capture; this is how this backend calls into
    # KraTte's own business logic (mutateRecord etc.) rather than
    # reimplementing it here.
    kratte_api_url: str = "https://kratte.onrender.com"
    kratte_internal_api_key: str = ""
    kratte_sso_secret: str = ""

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def supabase_storage_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/storage/v1"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Free-plan receipt cap, enforced server-side (see routers/receipts.py).
    # None = unlimited.
    plan_limits: dict = {"free": 100, "pro": 1000, "business": None}

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()
