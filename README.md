# DRCODE Discipline Challenge

Group accountability tracker for discipline and habit challenges. Users join groups via invite links, complete daily tasks with proof submissions, and compete on a shared leaderboard. Miss one task and you restart from Day 1.

**Tagline:** _Daily tasks. Proof required. No exceptions._

## What's Inside

```text
apps/
  web            Astro + React product UI
  web-host       Static host for production Astro builds
  api            NestJS + tRPC backend (auth, tasks, uploads, cron)
  mobile         Capacitor shell for iOS and Android
packages/
  db             Prisma schema, client, and migrations
  ui             Shared React components (TaskCard, HeatmapGrid, …)
  types          Shared domain types and contracts
  i18n           Shared localization helpers
  config-typescript  Reusable tsconfig presets
```

The web app imports shared UI packages, calls the typed tRPC API from React islands, and shares contracts through workspace packages. Internal dependencies use `workspace:*` so local packages stay linked without version drift.

## Stack

- PNPM workspaces and Turborepo
- Astro + React
- NestJS + Fastify + tRPC
- Prisma (SQLite locally, libSQL in production)
- React Query
- TypeScript and Tailwind CSS
- Capacitor (mobile)
- ESLint, Prettier, Git hooks, and GitHub Actions

## Getting Started

Use Node `>=22.13.0` and the pinned package manager, `pnpm@11.1.3`.

```bash
pnpm install
cp .env.example .env
pnpm --filter @workspace-starter/db exec prisma migrate dev
pnpm dev
```

Default local ports:

- Web: `http://127.0.0.1:4321`
- API: `http://localhost:3001`

For a production-style local run:

```bash
pnpm start
```

`pnpm start` builds the workspace, stages Astro frontends into the web host, then launches the web host and API together — the same topology as production.

See [docs/guides/deployment.md](docs/guides/deployment.md) for how frontends and backends are built, published, and deployed.

## Common Commands

```bash
pnpm dev
pnpm start
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm verify:fast
pnpm verify
pnpm hooks:install
```

Useful workspace-focused commands:

```bash
pnpm --filter @workspace-starter/web dev
pnpm --filter @workspace-starter/api dev
pnpm --filter @workspace-starter/db exec prisma migrate dev
pnpm --filter @workspace-starter/mobile build
```

Useful Docker commands:

```bash
docker compose up --build
```

The compose file runs the web host (bundled Astro frontends) and the API. See [docs/guides/deployment.md](docs/guides/deployment.md).

## Quality Gates

Run this once per checkout to use the repository hooks:

```bash
pnpm hooks:install
```

- `pre-commit` runs `pnpm verify:fast` (lint, formatting, types, whitespace).
- `pre-push` runs `pnpm verify` (adds full build and test suite).
- GitHub Actions runs `pnpm verify` on pull requests and pushes to `main`.

## Guides

- [Implementation plan (historical)](./docs/drcode-75-hard-challenge-plan.md)
- [PNPM workspace guide](./docs/guides/pnpm-workspace.md)
- [Turborepo guide](./docs/guides/turborepo.md)
- [Workspace guide](./docs/guides/workspace-guide.md)

## Acknowledgments

This project was bootstrapped from the [monorepo-astro-nestjs](https://github.com/mokbhai/monorepo-astro-nestjs) starter.
