from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite by default — swap for a real Postgres URL (e.g. Supabase) when you go live
    database_url: str = "sqlite:///./data/snapledger.db"

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

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()
