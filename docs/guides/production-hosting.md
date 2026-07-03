# Production hosting (Docker + nginx)

This guide covers hosting the app on a VPS with the stock `docker-compose.yml`
stack: `nginx` on public ports 80/443, `web-host` on `:4321`, and `api` on
`:3001` on the internal compose network.

## Domains and routing

Hostnames are configured with `WEB_DOMAIN` and `API_DOMAIN` in `.env` (defaults
shown below):

| Env var      | Default                | External ports | Upstream        |
| ------------ | ---------------------- | -------------- | --------------- |
| `WEB_DOMAIN` | `hobbit.drcode.ai`     | 80, 443        | `web-host:4321` |
| `API_DOMAIN` | `hobbit-api.drcode.ai` | 80, 443        | `api:3001`      |

HTTP requests redirect to HTTPS. TLS terminates at nginx. nginx reads
`WEB_DOMAIN` / `API_DOMAIN` at container start via envsubst templates in
`nginx/templates/`.

## DNS

Create A (and optionally AAAA) records pointing both hostnames at the server's
public IP. Use the same values you set for `WEB_DOMAIN` and `API_DOMAIN`.

## TLS certificates

nginx expects a certificate pair mounted at `nginx/certs/`:

- `fullchain.pem`
- `privkey.pem`

### First boot (self-signed, for smoke testing)

```bash
pnpm nginx:certs
```

This creates a dev certificate with SANs for `WEB_DOMAIN` and `API_DOMAIN`.
Override domains before running:

```bash
WEB_DOMAIN=staging.example.com API_DOMAIN=api-staging.example.com pnpm nginx:certs
```

Browsers will warn until you replace the files with CA-issued certs.

### Production (Let's Encrypt example)

On the host, obtain certs with certbot (standalone or webroot) and copy or
symlink them into `nginx/certs/` as `fullchain.pem` and `privkey.pem`, or mount
your certbot `live/` directory read-only in `docker-compose.yml`.

Automated renewal is out of scope for the compose file; use certbot timers or
your host's certificate manager and reload nginx after renewal.

## Environment

Copy `.env.example` to `.env` and set production values before building:

```env
WEB_DOMAIN=hobbit.drcode.ai
API_DOMAIN=hobbit-api.drcode.ai
PUBLIC_API_URL=https://hobbit-api.drcode.ai
CORS_ORIGIN=https://hobbit.drcode.ai
JWT_SECRET=<strong-random-secret>
DATABASE_URL=<production-database-url>
```

`PUBLIC_API_URL` and `CORS_ORIGIN` default from `API_DOMAIN` / `WEB_DOMAIN` in
compose when unset, but setting all four explicitly avoids surprises.

`PUBLIC_API_URL` is baked into the `web-host` image at **build** time via
compose `build.args`. Changing `API_DOMAIN` requires rebuilding `web-host`.

### Group invite links

The API builds `/join?token=…` URLs via `buildInviteUrl` in
`apps/api/src/utils/invite-url.ts`. Resolution order:

1. Request `Origin` header (when the browser sends one)
2. `FRONTEND_URL` (API-only; see `.env.example`)
3. First entry in `CORS_ORIGIN`
4. `http://localhost:4321` (local-dev fallback)

In production, `CORS_ORIGIN` (derived from `WEB_DOMAIN` when unset) is usually
enough. Set `FRONTEND_URL` when invite links must explicitly target the public
web hostname, or in local dev when you browse via a LAN IP or emulator host that
differs from `CORS_ORIGIN[0]`.

## Start the stack

```bash
pnpm nginx:certs   # skip if real certs are already in nginx/certs/
docker compose up --build -d
```

Verify (substitute your domains):

- `https://hobbit.drcode.ai` serves the web UI
- `https://hobbit-api.drcode.ai/trpc` responds (health/tRPC from the API)
- Browser network tab shows API calls going to `hobbit-api.drcode.ai`

`web-host` and `api` are not published on the host; only nginx exposes 80/443.

## Android App Links (Digital Asset Links)

The HOBBIT Android APK (`com.drcode.hobbit`) declares verified App Links for
`https://<WEB_DOMAIN>/join…` in
`apps/mobile/android/app/src/main/AndroidManifest.xml` (`android:autoVerify="true"`).

Android only skips the browser/app chooser when the production site serves a
matching Digital Asset Links file at:

```text
https://<WEB_DOMAIN>/.well-known/assetlinks.json
```

`scripts/build-frontends.mjs` generates this file into
`apps/web/public/.well-known/assetlinks.json` before each Astro static build.
The staged bundle is served by `web-host` at the same path (no auth; JSON is
cacheable for one hour).

### Deploy step

1. Obtain the SHA-256 certificate fingerprint for the APK signing key that
   actually ships. Today the release workflow builds a **debug** APK
   (`assembleDebug`); use the debug keystore until a release keystore is wired
   (#180):

   ```bash
   keytool -list -v \
     -keystore ~/.android/debug.keystore \
     -alias androiddebugkey \
     -storepass android -keypass android
   ```

   For a release keystore, swap `-keystore`, `-alias`, and passwords. Copy the
   `SHA256:` value (colon-separated hex). Multiple keys (e.g. upload + app
   signing): comma-separate fingerprints.

2. Set the fingerprint when building the `web-host` image (not committed):

   ```bash
   export ANDROID_SHA256_CERT_FINGERPRINTS='AA:BB:CC:...'
   docker compose build web-host
   docker compose up -d
   ```

   `docker-compose.yml` passes `ANDROID_SHA256_CERT_FINGERPRINTS` as a build arg
   to `apps/web-host/Dockerfile`. Override `ANDROID_PACKAGE_NAME` only if the
   Capacitor `appId` changes (default `com.drcode.hobbit`).

3. Verify after deploy:

   ```bash
   curl -sS "https://${WEB_DOMAIN}/.well-known/assetlinks.json" | jq .
   ```

   Expect `application/json`, `package_name: com.drcode.hobbit`, and your
   fingerprint(s). Rebuild/redeploy `web-host` whenever the signing key changes.

Example payload shape:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.drcode.hobbit",
      "sha256_cert_fingerprints": ["SHA256_CERT_FINGERPRINT"]
    }
  }
]
```

Until fingerprints are injected at image build, the file is still served but
Android verification fails and invite taps may show a disambiguation chooser.

## Config layout

```
nginx/
├── nginx.conf
├── templates/
│   ├── web.conf.template    # ${WEB_DOMAIN} → web-host:4321
│   └── api.conf.template    # ${API_DOMAIN} → api:3001
├── snippets/
│   └── proxy-params.conf    # shared proxy headers + WebSocket upgrade
└── certs/                   # TLS material (not committed)
```

To change upload limits, align `client_max_body_size` in
`nginx/templates/api.conf.template` with `MAX_UPLOAD_BYTES` on the `api`
service.

## Related

- [deployment.md](./deployment.md) — image build/publish pipeline and deploy adapters
