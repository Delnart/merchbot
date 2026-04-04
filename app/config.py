from typing import Any

from pydantic import Field, Json
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

class Settings(BaseSettings):
    bot_token: str = Field(validation_alias="BOT_TOKEN")
    webhook_secret: str = Field(validation_alias="WEBHOOK_SECRET")
    database_url: str = Field(validation_alias="DATABASE_URL")
    app_base_url: str = Field(default="", validation_alias="APP_BASE_URL")
    webapp_url: str = Field(default="", validation_alias="WEBAPP_URL")
    admin_default_currency: str = Field(default="UAH", validation_alias="ADMIN_DEFAULT_CURRENCY")
    admin_owner_ids_raw: str = Field(default="", validation_alias="ADMIN_OWNER_IDS")
    broadcast_delay_ms: int = Field(default=100, validation_alias="BROADCAST_DELAY_MS")
    
    google_creds_json: Json | None = Field(default=None, validation_alias="GOOGLE_CREDS_JSON")
    google_sheets_id: str = Field(default="", validation_alias="GOOGLE_SHEETS_ID")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def admin_owner_ids(self) -> set[int]:
        ids = set()
        for chunk in self.admin_owner_ids_raw.split(","):
            val = chunk.strip()
            if not val:
                continue
            try:
                ids.add(int(val))
            except ValueError:
                continue
        return ids

    @property
    def resolved_webapp_url(self) -> str:
        if self.webapp_url:
            return self.webapp_url.rstrip("/")
        if not self.app_base_url:
            return "http://localhost:3000"
        return f"{self.app_base_url.rstrip('/')}/"

    @property
    def normalized_database_url(self) -> str:
        url = self.database_url.strip()
        if url.startswith("postgresql+asyncpg://") or url.startswith("sqlite+aiosqlite://"):
            normalized = url
        elif url.startswith("postgres://"):
            normalized = "postgresql+asyncpg://" + url[len("postgres://") :]
        elif url.startswith("postgresql://"):
            normalized = "postgresql+asyncpg://" + url[len("postgresql://") :]
        else:
            normalized = url

        if not normalized.startswith("postgresql+asyncpg://"):
            return normalized

        parsed = urlparse(normalized)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))

        # asyncpg accepts SSL better through connect_args than DSN params
        query.pop("sslmode", None)
        query.pop("ssl", None)

        return urlunparse(parsed._replace(query=urlencode(query)))

    @property
    def database_connect_args(self) -> dict[str, Any]:
        url = self.database_url.strip()
        parsed = urlparse(url)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))

        sslmode = query.get("sslmode", "").lower()
        ssl_value = query.get("ssl", "").lower()

        if sslmode in {"require", "verify-ca", "verify-full"} or ssl_value in {"require", "true", "1"}:
            return {"ssl": "require"}
        if sslmode == "disable" or ssl_value in {"disable", "false", "0"}:
            return {"ssl": False}
        return {}

settings = Settings()