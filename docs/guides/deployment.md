# Deployment

DailyHabbit ships a deployment mechanism and contract, not a commitment to any one host. Configure the target adapter for your environment.

## Model: frontends aggregate, backends stay independent

Frontends and backends are different problems, so they deploy differently:

- **Frontends are static artifacts.** Every Astro app under `apps/*` is built
  as a static site and bundled into a single deployable, `apps/web-host`. The
  primary frontend (default `web`) is served at `/`, every other frontend at
  `/<dir-name>`. One image, one deploy, one origin — no matter how many
  frontends you have.
- **Backends are stateful services.** Each backend (e.g. `apps/api`) ships its
  own image and deploys independently, with its own runtime and scaling.

A reverse proxy / ingress in front routes hostnames or paths to the web-host
image and to each backend.

```
proxy ── /, /admin, … ─► web-host image (all frontends)
     ├── api.*          ─► api image
     └── jobs.*         ─► other backend images
```

## The convention: a Dockerfile makes an app deployable

> **An app produces a published image iff it has `apps/<name>/Dockerfile`.**

- **Add a frontend:** create an Astro app under `apps/<name>` (no Dockerfile).
  `scripts/build-frontends.mjs` discovers it, builds it static, and stages it
  under `apps/web-host/sites/<name>`; web-host mounts it at `/<name>`. No edits
  to web-host or any workflow.
- **Add a backend:** create `apps/<name>` with its own `Dockerfile`. The
  build-and-publish workflow picks it up automatically.
- **Promote a frontend to its own deploy** (own domain / release cadence): give
  it its own `Dockerfile` and it becomes an independently published image like
  a backend. This is the deliberate exception to aggregation.

The primary frontend is chosen by the `PRIMARY_FRONTEND` env (default `web`)
and is mounted at `/`. A frontend's Astro `base` must match its mount path;
`build-frontends.mjs` sets `ASTRO_BASE` per app so they stay in sync.

## Pipeline

`.github/workflows/build-and-publish.yml` runs **only after CI ("Verify")
succeeds on `main`**, so a red build can never ship. It:

1. Discovers deployable apps (`apps/*/Dockerfile`).
2. Builds each image and pushes to the registry, tagged by git SHA and
   `latest`. Default registry is GHCR (`ghcr.io/<owner>/<repo>`); override with
   the `DEPLOY_REGISTRY` repository variable.
3. Invokes the deploy dispatcher (below).

All deployable images are rebuilt every run for predictability. Products that
want affected-only builds can filter the discover matrix.

## The deploy contract

`scripts/deploy/run.mjs` is host-agnostic. It reads the `DEPLOY_TARGET`
repository variable and calls `scripts/deploy/adapters/<target>.mjs`:

```js
export default async function deploy(context) {
  // context = {
  //   target,                       // the DEPLOY_TARGET value
  //   images,   // { 'web-host': 'ghcr.io/owner/repo/web-host:<sha>', api: '…' }
  //   apps,     // ['web-host', 'api']
  //   sha,      // git SHA being deployed
  //   registry, // resolved registry base
  //   env,      // process.env (for secrets/config)
  // }
}
```

With no `DEPLOY_TARGET`, or no matching adapter, deploy is a documented no-op,
so a fresh clone stays green.

### Writing an adapter

1. Copy `scripts/deploy/adapters/example-echo.mjs` to
   `scripts/deploy/adapters/<target>.mjs`.
2. Implement `deploy(context)` for your host. Common shapes:
   - **VPS:** `ssh host 'cd /srv/app && docker compose pull && docker compose up -d'`
   - **Cloud Run:** `gcloud run deploy <svc> --image <imageRef>` per image
   - **Kubernetes:** `kubectl set image deploy/<svc> <svc>=<imageRef>` per image
3. Set the `DEPLOY_TARGET` repository variable to `<target>` and add any
   secrets your adapter reads from `context.env`.

## Local production run

`pnpm start` builds everything, stages the frontends, and runs the web-host and
api together — the same topology as production, on one machine.
