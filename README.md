# UCSD Campus Parking Status

A single-page dashboard that visualizes live parking availability from the UCSD
Campus Parking Service. A FastAPI backend holds the OAuth credentials
server-side, fetches and refreshes access tokens automatically, and proxies the
parking JSON to the browser.

## Architecture

```
Browser (SPA) ── GET /api/parking/status ── FastAPI backend ── OAuth token (cached) ── Parking API
                     same origin, no secrets        │
                                                    └── Basic auth: consumer key/secret (env vars only)
```

- **Backend** (`app/`, Python 3.13 / FastAPI, port 8000)
  - `GET /api/parking/status` — calls the upstream parking API with a bearer
    token, caches the upstream response for 10 seconds, and returns the JSON.
  - `GET /api/health` — health check used by the container platform.
  - Tokens are obtained with the OAuth 2.0 **client-credentials** grant,
    cached in memory, refreshed 60 seconds before expiry, and force-refreshed
    once if the upstream API answers `401`.
  - Credentials are read **only** from environment variables on the server.
    They are never sent to the browser and never baked into the image.
- **Frontend** (`app/static/`, vanilla HTML/CSS/JS — no build step)
  - Served by the backend at `/`.
  - Renders each parking structure as a card with overall and per-space-type
    availability bars, color-coded by fullness.
  - Campus-wide summary ring, neighborhood filter chips, search, sorting,
    30-second auto-refresh (pauses in background tabs), and a syntax-highlighted
    raw JSON view of the exact API response.

## Quick start (local)

1. Copy `.env.example` to `.env` and fill in the values. **Never commit `.env`.**
2. Install and run:

   ```powershell
   python -m pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

3. Open <http://localhost:8000>.

No system Python is required on this workstation: the repo-embedded portable
runtime in `.python/` can run everything:

```powershell
.python\python.exe -m pip install -r requirements.txt
.python\python.exe -m uvicorn app.main:app --port 8000
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `API_URL` | Upstream parking status endpoint |
| `TOKEN_URL` | OAuth token endpoint |
| `CONSUMER_KEY` | OAuth client id (server-side only) |
| `CONSUMER_SECRET` | OAuth client secret (server-side only) |

For local development the values are read from a gitignored `.env` file. In
production, set real environment variables (or platform-managed secrets) —
never bake credentials into the container image or Helm values.

## Tests

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
```

## Container build

The included `Dockerfile` follows the campus platform template: `python:3.13-slim`,
non-root `appuser` (UID 1000), app served by uvicorn on port 8000, and a
`/api/health` container healthcheck. The GitHub Actions workflow
(`.github/workflows/docker.yml`) builds and pushes the image to `ghcr.io` on
every push to `main` — a green build checkmark is the deployment handoff
milestone. Secrets are injected platform-side at deploy time, never in the image.

## DSMLP deployment handoff

- `chart/` — platform-spec Helm chart (Deployment + Service + Ingress, secrets
  referenced by name, no PVC — app is stateless). Verified with
  `helm lint` and `helm template`.
- `DEPLOYMENT.md` — handoff notes for the TritonAI platform team: env vars,
  secret names/keys, persistence, access, and data classification.
