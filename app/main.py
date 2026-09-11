"""UCSD Campus Parking Status — FastAPI backend and single-page frontend host."""

import asyncio
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import MissingConfigurationError, get_settings
from .oauth import OAuthError, TokenManager

app = FastAPI(
    title="UCSD Campus Parking Status",
    description="Single-page dashboard for the UCSD campus parking status API.",
)

static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

UPSTREAM_CACHE_TTL_SECONDS = 10.0

_status_cache: dict[str, object] = {"payload": None, "fetched_at": 0.0}
_status_lock = asyncio.Lock()
_token_manager: TokenManager | None = None


def get_token_manager() -> TokenManager:
    global _token_manager
    if _token_manager is None:
        _token_manager = TokenManager(get_settings())
    return _token_manager


async def _fetch_upstream(settings) -> object:
    manager = get_token_manager()
    token = await manager.get_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(settings.api_url, headers=headers)
        if response.status_code == 401:
            token = await manager.get_token(force_refresh=True)
            headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
            response = await client.get(settings.api_url, headers=headers)
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Parking API returned HTTP {response.status_code}",
        )
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502, detail="Parking API returned a non-JSON response"
        ) from exc


@app.get("/api/health")
async def health() -> dict[str, object]:
    try:
        get_settings()
        configured = True
    except MissingConfigurationError:
        configured = False
    return {"status": "ok", "configured": configured}


@app.get("/api/parking/status")
async def parking_status() -> JSONResponse:
    try:
        settings = get_settings()
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    async with _status_lock:
        if (
            _status_cache["payload"] is not None
            and time.monotonic() - _status_cache["fetched_at"] < UPSTREAM_CACHE_TTL_SECONDS
        ):
            return JSONResponse(content=_status_cache["payload"])

        try:
            payload = await _fetch_upstream(settings)
        except OAuthError as exc:
            raise HTTPException(status_code=502, detail=f"OAuth error: {exc}") from exc

        _status_cache["payload"] = payload
        _status_cache["fetched_at"] = time.monotonic()
        return JSONResponse(content=payload)


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(static_dir / "index.html")
