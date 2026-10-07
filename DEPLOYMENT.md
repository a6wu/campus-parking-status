# Deployment Handoff — Campus Parking Status

Handoff notes for the TritonAI platform team. Everything below is also
inferable from the repo; this file saves the archaeology.

## App

- **Name / one-line purpose:** Campus Parking Status — single-page dashboard that
  visualizes live UCSD campus parking availability from the Campus Parking
  Service v1.3 status API.
- **Repo:** `https://github.com/a6wu/campus-parking-status` (adjust owner if the
  repo is created under a different account; team access granted at handoff)
- **Image:** `ghcr.io/a6wu/campus-parking-status` — build workflow status:
  ⏳ pending first push (Actions workflow at `.github/workflows/docker.yml`)
- **Stack:** template-standard FastAPI/uvicorn, Python 3.13, port 8000,
  `/api/health` health endpoint, non-root `appuser` (UID 1000). Stateless — no
  database, no filesystem writes.

## Configuration

| Env var | Purpose | Example (non-secret) | Secret? |
|---|---|---|---|
| `API_URL` | Upstream parking status endpoint | `https://api.ucsd.edu:8243/campusparkingservice/v1.3/status` | no |
| `TOKEN_URL` | OAuth token endpoint | `https://api.ucsd.edu/oauth2/token` | no |
| `CONSUMER_KEY` | OAuth client id for the parking API | — | **yes — install as Secret** |
| `CONSUMER_SECRET` | OAuth client secret for the parking API | — | **yes — install as Secret** |

- **Secrets needed:** one Secret, `campus-parking-status-oauth`, with keys
  `CONSUMER_KEY` and `CONSUMER_SECRET`. The chart references it by name only;
  values are delivered out-of-band (never committed to the repo).
- **Persistence:** stateless — no PVC, no Litestream.

The backend obtains OAuth tokens via the client-credentials grant, caches them
in memory, refreshes 60s before expiry, and force-refreshes on upstream 401.
Credentials never reach the browser; the SPA only calls same-origin
`/api/parking/status`.

**Note on QA vs production endpoints:** the defaults above point at the
production API host (`api.ucsd.edu`). For local development you may instead use
the QA endpoints (`https://api-qa.ucsd.edu:8243/campusparkingservice/v1.3/status`
and `https://api-qa.ucsd.edu/oauth2/token`) with QA credentials kept in the
gitignored `.env` file — QA credentials are rejected by the production token
endpoint, so the two must match.

## Ride-along services

None.

## Helm chart

- Location in repo: `chart/`
- `helm lint` + `helm template` pass: **yes** (Helm v3.16.4)
- Non-default notes: `strategy: RollingUpdate` (app is stateless); requested
  ingress host `campus-parking-status.ucsd.edu` (final host assigned by the
  platform team); secret keys injected via `extraEnv.secretKeyRef`.

## Access & data

- **Audience:** campus-only (UCSD network/VPN) — default
- **Login needed?** no — the dashboard shows aggregate parking counts only; no
  user accounts or personal data
- **Data classification:** P1/P2 only confirmed: **yes** (public aggregate
  parking availability; no P3/P4 in app or fixtures)

## Contact

- **Developer / owner:** a6wu
- **Best way to reach for review questions:** TritonAI Harness session / campus email
