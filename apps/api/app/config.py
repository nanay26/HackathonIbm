from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Langflow
    langflow_base_url: str = "http://localhost:7860"
    langflow_api_key: str = "changeme"
    langflow_flow5_id: str = "00000000-0000-0000-0000-000000000000"
    langflow_mcp_url: str = ""
    langflow_mock: bool = False

    # AI Agent (Chat & Reasoning)
    ai_api_key: str = ""
    gemini_api_key: str = ""
    google_api_key: str = ""
    ai_model: str = "gemini-3.8-flash"

    @property
    def effective_ai_key(self) -> str:
        return self.ai_api_key or self.gemini_api_key or self.google_api_key or ""

    # Review limits
    review_timeout_seconds: int = 360
    max_input_chars: int = 500_000
    max_upload_mb: int = 10
    max_concurrent_reviews: int = 5
    job_ttl_seconds: int = 1800

    # Rate limits
    rate_limit_hourly: int = 1000
    rate_limit_daily: int = 5000
    global_daily_review_cap: int = 5000

    # CORS — stored as comma-separated string, parsed into a list
    allowed_origins: str = "http://localhost:3000"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    # Frontend (unused by backend; kept here for documentation)
    next_public_api_base_url: str = "http://localhost:8000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
