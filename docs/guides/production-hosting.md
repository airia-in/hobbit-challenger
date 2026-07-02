# Production hosting (Docker + nginx)

This guide covers hosting the app on a VPS with the stock `docker-compose.yml`
stack: `nginx` on public ports 80/443, `web-host` on `:4321`, and `api` on
`:3001` on the internal compose network.

## Domains and routing

| Hostname               | External ports | Upstream        |
| ---------------------- | -------------- | --------------- |
| `hobbit.drcode.ai`     | 80, 443        | `web-host:4321` |
| `hobbit-api.drcode.ai` | 80, 443        | `api:3001`      |

HTTP requests redirect to HTTPS. TLS terminates at nginx.

## DNS

Create A (and optionally AAAA) records pointing both hostnames at the server's
public IP:

- `hobbit.drcode.ai`
- `hobbit-api.drcode.ai`

## TLS certificates

nginx expects a certificate pair mounted at `nginx/certs/`:

- `fullchain.pem`
- `privkey.pem`

### First boot (self-signed, for smoke testing)

```bash
pnpm nginx:certs
```

This creates a dev certificate with SANs for both hostnames. Browsers will warn
until you replace the files with CA-issued certs.

### Production (Let's Encrypt example)

On the host, obtain certs with certbot (standalone or webroot) and copy or
symlink them into `nginx/certs/` as `fullchain.pem` and `privkey.pem`, or mount
your certbot `live/` directory read-only in `docker-compose.yml`.

Automated renewal is out of scope for the compose file; use certbot timers or
your host's certificate manager and reload nginx after renewal.

## Environment

Copy `.env.example` to `.env` and set production values before building:

```env
PUBLIC_API_URL=https://hobbit-api.drcode.ai
CORS_ORIGIN=https://hobbit.drcode.ai
JWT_SECRET=<strong-random-secret>
DATABASE_URL=<production-database-url>
```

`PUBLIC_API_URL` is baked into the `web-host` image at **build** time via
compose `build.args`. Changing it requires rebuilding the `web-host` service.

## Start the stack

```bash
pnpm nginx:certs   # skip if real certs are already in nginx/certs/
docker compose up --build -d
```

Verify:

- `https://hobbit.drcode.ai` serves the web UI
- `https://hobbit-api.drcode.ai/trpc` responds (health/tRPC from the API)
- Browser network tab shows API calls going to `hobbit-api.drcode.ai`

`web-host` and `api` are not published on the host; only nginx exposes 80/443.

## Config layout

```
nginx/
├── nginx.conf
├── conf.d/
│   ├── hobbit-web.conf      # hobbit.drcode.ai → web-host:4321
│   └── hobbit-api.conf      # hobbit-api.drcode.ai → api:3001
├── snippets/
│   └── proxy-params.conf    # shared proxy headers + WebSocket upgrade
└── certs/                   # TLS material (not committed)
```

To change upload limits, align `client_max_body_size` in
`nginx/conf.d/hobbit-api.conf` with `MAX_UPLOAD_BYTES` on the `api` service.

## Related

- [deployment.md](./deployment.md) — image build/publish pipeline and deploy adapters
