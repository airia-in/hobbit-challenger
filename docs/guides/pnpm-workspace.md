# PNPM Workspace Guide

## What PNPM Workspaces Are Doing Here

PNPM workspaces let the repository manage multiple apps and packages from one lockfile while keeping internal dependencies linked locally through `workspace:*`.

## Workspace Layout

- `apps/*` contains runnable applications.
- `packages/*` contains reusable libraries and shared configuration.

The workspace is defined in [pnpm-workspace.yaml](../../pnpm-workspace.yaml).

## Useful Commands

```bash
pnpm install
pnpm --filter @workspace-starter/web dev
pnpm --filter @workspace-starter/api dev
pnpm --filter @workspace-starter/web-host start
pnpm --filter @workspace-starter/db exec prisma migrate dev
pnpm --filter @workspace-starter/ui build
pnpm --filter @workspace-starter/types typecheck
pnpm --filter @workspace-starter/i18n test
pnpm --filter @workspace-starter/mobile build
```

## Workspace Dependencies

Use `workspace:*` for internal packages:

```json
{
  "dependencies": {
    "@workspace-starter/db": "workspace:*",
    "@workspace-starter/ui": "workspace:*"
  }
}
```

That keeps local package resolution explicit and makes refactors easier across the monorepo.

## Catalogs

PNPM catalogs in [pnpm-workspace.yaml](../../pnpm-workspace.yaml) pin common dependency versions. Use `catalog:` when multiple workspaces should share the same version of a dependency.

## Adding A New Package

1. Create a new folder under `packages/`.
2. Add a `package.json` with a scoped name.
3. Add scripts for `build`, `typecheck`, or other tasks as needed.
4. Reference it from apps or other packages using `workspace:*`.
