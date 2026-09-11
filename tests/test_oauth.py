import asyncio
import base64

import httpx

from app.config import Settings
from app.oauth import OAuthError, TokenManager

SETTINGS = Settings(
    api_url="https://parking.example/status",
    token_url="https://auth.example/token",
    consumer_key="test-key",
    consumer_secret="test-secret",
)


def run(coro):
    return asyncio.run(coro)


def make_manager(responses):
    calls = []

    async def handler(request):
        calls.append(request)
        return responses[len(calls) - 1]

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    manager = TokenManager(SETTINGS, client=client)
    return manager, calls, client


def close(client):
    run(client.aclose())


def test_token_is_cached_until_expiry():
    manager, calls, client = make_manager(
        [httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})]
    )
    assert run(manager.get_token()) == "token-1"
    assert run(manager.get_token()) == "token-1"
    assert len(calls) == 1
    close(client)


def test_force_refresh_fetches_new_token():
    manager, calls, client = make_manager(
        [
            httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600}),
            httpx.Response(200, json={"access_token": "token-2", "expires_in": 3600}),
        ]
    )
    run(manager.get_token())
    assert run(manager.get_token(force_refresh=True)) == "token-2"
    assert len(calls) == 2
    close(client)


def test_stale_token_is_refreshed_automatically():
    manager, calls, client = make_manager(
        [
            httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600}),
            httpx.Response(200, json={"access_token": "token-2", "expires_in": 3600}),
        ]
    )
    run(manager.get_token())
    manager._expires_at = 0.0
    assert run(manager.get_token()) == "token-2"
    assert len(calls) == 2
    close(client)


def test_client_credentials_are_sent_as_basic_auth():
    manager, calls, client = make_manager(
        [httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})]
    )
    run(manager.get_token())
    request = calls[0]
    expected = base64.b64encode(b"test-key:test-secret").decode()
    assert request.headers["Authorization"] == f"Basic {expected}"
    assert request.read().decode() == "grant_type=client_credentials"
    close(client)


def test_non_200_response_raises_oauth_error():
    manager, _, client = make_manager(
        [httpx.Response(401, json={"error": "invalid_client"})]
    )
    try:
        run(manager.get_token())
        raise AssertionError("expected OAuthError")
    except OAuthError as exc:
        assert "HTTP 401" in str(exc)
    finally:
        close(client)
