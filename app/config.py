"""Application configuration loaded from environment variables."""

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class MissingConfigurationError(RuntimeError):
    """Raised when required server-side credentials are not configured."""


@dataclass(frozen=True)
class Settings:
    api_url: str
    token_url: str
    consumer_key: str
    consumer_secret: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load settings from the environment, failing loudly when incomplete."""
    values = {}
    for name in ("API_URL", "TOKEN_URL", "CONSUMER_KEY", "CONSUMER_SECRET"):
        value = os.environ.get(name, "").strip()
        if not value:
            raise MissingConfigurationError(
                f"Missing required environment variable: {name}. "
                "Copy .env.example to .env and fill in the values (local development), "
                "or set the variable in the deployment environment."
            )
        values[name.lower()] = value
    return Settings(**values)
