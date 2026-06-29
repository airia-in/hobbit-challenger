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

## Database Changes

Schema and migrations live in `packages/db`. After editing the Prisma schema:

```bash
pnpm --filter @workspace-starter/db exec prisma migrate dev
```
