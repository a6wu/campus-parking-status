"""OAuth 2.0 client-credentials token management for the upstream parking API."""

import asyncio
import base64
import time
from typing import Any

import httpx

from .config import Settings

DEFAULT_EXPIRES_IN_SECONDS = 3600
REFRESH_SAFETY_MARGIN_SECONDS = 60.0
MIN_TOKEN_LIFETIME_SECONDS = 5.0


class OAuthError(RuntimeError):
    """Raised when an access token cannot be obtained from the OAuth server."""


class TokenManager:
    """Fetches and caches OAuth tokens, refreshing them before they expire.

    Client credentials never leave the server: the browser only ever talks to
    this application's own /api/parking/status endpoint.
    """

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._settings = settings
        self._client = client
        self._lock = asyncio.Lock()
        self._token: str | None = None
        self._expires_at: float = 0.0

    async def _fetch_token(self) -> None:
        credentials = (
            f"{self._settings.consumer_key}:{self._settings.consumer_secret}".encode()
        )
        headers = {
            "Authorization": f"Basic {base64.b64encode(credentials).decode()}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        client = self._client or httpx.AsyncClient(timeout=15.0)
        try:
            response = await client.post(
                self._settings.token_url,
                headers=headers,
                data={"grant_type": "client_credentials"},
            )
        except httpx.HTTPError as exc:
            raise OAuthError(f"Could not reach the OAuth token endpoint: {exc}") from exc
        finally:
            if self._client is None:
                await client.aclose()

        if response.status_code != 200:
            raise OAuthError(f"OAuth token endpoint returned HTTP {response.status_code}")

        try:
            payload: dict[str, Any] = response.json()
            token = payload["access_token"]
            expires_in = int(payload.get("expires_in", DEFAULT_EXPIRES_IN_SECONDS))
        except (ValueError, KeyError, TypeError) as exc:
            raise OAuthError("OAuth token endpoint returned an unexpected payload") from exc

        self._token = token
        self._expires_at = time.monotonic() + max(expires_in, MIN_TOKEN_LIFETIME_SECONDS)

    def _is_fresh(self) -> bool:
        return self._token is not None and (
            time.monotonic() < self._expires_at - REFRESH_SAFETY_MARGIN_SECONDS
        )

    async def get_token(self, force_refresh: bool = False) -> str:
        """Return a valid access token, fetching or refreshing it when needed."""
        async with self._lock:
            if force_refresh or not self._is_fresh():
                await self._fetch_token()
            if self._token is None:
                raise OAuthError("No access token is available")
            return self._token
