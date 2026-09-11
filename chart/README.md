# UCSD Webapp Helm Chart (template)

Ride-along asset for the `ucsd-dsmlp-deploy` skill. Built to the platform team's
spec: Deployment + Service + Ingress, optional PVC for the data directory, every
environment variable settable via values, arbitrary `volumes`/`volumeMounts`
separate from the PVC, and **secrets installed outside Helm** — the chart only
references externally managed Secrets through `envFrom.secretRef` or
`extraEnv.secretKeyRef`, injecting their keys as environment variables at runtime.

## Use

1. Copy this directory into your app repo as `chart/` (or `helm/<app-name>/`).
2. Rename: set `name` in `Chart.yaml` to your app's name.
3. Edit `values.yaml` — everything marked `CHANGEME`, plus:
   - `env:` — every non-secret environment variable your app reads
   - `envFrom:` — names of pre-existing Secrets/ConfigMaps to bulk-inject
   - `extraEnv:` — individual vars via `secretKeyRef`, `configMapKeyRef`, or
     Downward API `fieldRef`
   - `persistence:` — enable if your app writes to a data directory
   - `extraVolumes` / `extraVolumeMounts` — only if you need mounts beyond the PVC
4. Verify locally: `helm lint .` and `helm template myapp .` must succeed.

If `persistence.enabled=true` and `persistence.usePvc=false`, provide the backing
volume yourself in `extraVolumes`: name it `data` for normal persistence, or `replica`
when `litestream.enabled=true`. The chart fails render if that required volume is
missing, so handoff checks cannot pass with an invalid Deployment.

## SQLite apps

Keep `replicaCount: 1` and `strategy: Recreate` (defaults). If the app stores data in
SQLite, **set `litestream.enabled: true`** and point `litestream.dbPath` at the same
path as the app's `DATABASE_URL` — WAL on NFS corrupts without it. In Litestream mode,
the chart fails render if `replicaCount` is not `1` or `strategy.type` is not
`Recreate`. The chart then runs the live DB on a node-local `emptyDir`, uses the PVC as
the replica target, restores on startup, and replicates continuously via a native
sidecar (needs Kubernetes ≥ 1.29).

The canonical deployed example is `agt/gpu-reservation-app` (`helm/gpu-reservation/`) —
this chart mirrors its Litestream pattern; copy app-specific extras (`AUTH_PROVIDER`
presets, roster sync) from there as needed.

## Don't

- Don't put secret values anywhere in the chart — names only.
- Don't pre-tune `resources`, `replicaCount`, ingress class/annotations, or storage
  class beyond defaults — the platform team sets those at deploy time.
- Don't change the probe path unless your app doesn't serve `/api/health` (it
  should — that's the template convention).
