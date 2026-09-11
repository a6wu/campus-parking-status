# UCSD Webapp Helm Chart Asset

## Provenance

- **Asset:** UCSD citizen-developer web app Helm chart template
- **Created for:** `ucsd-dsmlp-deploy`
- **Source date:** 2026-06-10 TritonAI DSMLP hosting working session
- **Reference implementation:** https://github.com/agt/gpu-reservation-app
- **Template reference:** https://github.com/agt/claude-webapp-template
- **Last reviewed:** 2026-06-26

## Scope

This chart is a first-party template asset for UCSD DSMLP handoff packaging. It is not
vendored third-party code. The YAML templates encode the platform handoff contract:
Deployment, Service, Ingress, optional PVC, externally managed secrets referenced by
name, configurable environment variables, arbitrary volumes/mounts, and optional
SQLite/Litestream replication.

The chart mirrors patterns from the real deployed `agt/gpu-reservation-app`
`helm/gpu-reservation/` chart where applicable, especially the FastAPI app shape,
environment variable mechanisms, PVC handling, and Litestream sidecar workflow.

## License & Redistribution

The chart is authored for this repository and may be redistributed with the UCSD skills
library and UCSD-affiliated app repositories. Referenced repositories remain under
their own repository licenses and are used as implementation references, not copied
wholesale into this asset.

## Integrity

Checksums (SHA-256) are in `checksums.sha256` in this directory. Verify with:

```sh
cd ucsd-dsmlp-deploy/assets/helm-chart
sha256sum -c checksums.sha256
```
