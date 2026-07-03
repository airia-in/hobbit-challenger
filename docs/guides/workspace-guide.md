# Workspace Guide

## Package Scope

Internal packages use the `@workspace-starter/*` scope. When adding a new app or package, follow the same naming pattern in `package.json`, imports, and TypeScript path aliases.

## Add A New App

1. Create a folder in `apps/`.
2. Add a `package.json` with workspace scripts.
3. Add dependencies using `catalog:` and `workspace:*` where appropriate.
4. Make sure its scripts align with the root Turbo tasks (`build`, `dev`, `typecheck`, `lint`, `test`).

## Add A Shared Package

1. Create a folder in `packages/`.
2. Add `package.json`, source files, and `tsconfig.json`.
3. Reference the shared config package if it is TypeScript-based.
4. Add build/typecheck scripts that fit the monorepo task graph.

## Environment Variables

Copy [.env.example](../../.env.example) for local setup. Never commit secrets.

Set `FRONTEND_URL` when group invite links must use a web origin different from
the first `CORS_ORIGIN` entry (for example a LAN IP or mobile emulator). See
[group invite links](./production-hosting.md#group-invite-links) for precedence
details.

## Internationalization

The web app keeps Astro i18n scaffolding (`apps/web/src/i18n/config.ts`, `astro.config.ts`) for English-only routing today. A stub German (`/de`) locale was removed in issue #142 because it advertised localization without HOBBIT product strings. Do not re-add locale folders or config entries until a real localization effort is planned; see `.agents/skills/astro-i18n` when that work starts.

## Database Changes

Schema and migrations live in `packages/db`. After editing the Prisma schema:

```bash
pnpm --filter @workspace-starter/db exec prisma migrate dev
```
