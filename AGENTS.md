# Repository Guidelines

## Core Priorities

1. Performance and reliability are both first-class concerns.
2. Keep behavior predictable under load and during failures, including session restarts, reconnects, partial streams, and retries.
3. Prefer changes that preserve existing contracts and failure behavior unless the task explicitly requires a contract change.

If a tradeoff is required, choose correctness and robustness first, then performance, then short-term convenience. Do not improve performance by making failures harder to reason about.

## Maintainability

Long-term maintainability is a core priority. Before adding new logic, check for existing helpers, shared modules, and workspace patterns. Extract shared logic when reuse is likely or when two or more call sites would otherwise duplicate meaningful behavior. Avoid broad refactors that are not needed for the current task, but do change existing code when that is the smallest robust solution.

## Skill Maintenance

Repo-local skills live in `.agents/skills`. When user prompts, repeated communication patterns, task friction, or review feedback reveal reusable guidance for future agents, use `improve-skills-iteratively` to update or create the smallest relevant skill. Keep skill changes narrow, validate them with the skill's documented checks when available, and mention the skill update in the final handoff. Do not turn one-off preferences into broad rules.

## Project Structure & Module Organization

PNPM/Turborepo monorepo. Apps: `apps/web` is the Astro frontend and `apps/api` is the NestJS + tRPC API. Packages: `packages/ui` contains React components, `packages/types` contains shared contracts, and `packages/config-typescript` contains reusable `tsconfig` presets. Root tests are in `tests/`, setup scripts in `scripts/`, and guides in `docs/guides/`.

## Build, Test, and Development Commands

Use Node `>=22.13.0` and the pinned package manager from `packageManager` (`pnpm@11.1.3`). Do not upgrade Node, PNPM, Turbo, or framework versions unless the task is specifically about dependency maintenance.

- `pnpm install`: install dependencies.
- `pnpm build`: build all workspaces.
- `pnpm typecheck`: run TypeScript checks.
- `pnpm lint`: run ESLint across workspaces.
- `pnpm test`: run root `node:test` files, then package Turbo tests.
- Do not run `pnpm dev`, `pnpm start`, or workspace `dev`/`start` scripts unless explicitly requested.

## Coding Style & Naming Conventions

Write TypeScript/TSX ES modules with two-space indentation, single quotes, and semicolons. Use `PascalCase` for React components/exported types, `camelCase` for functions/variables, and kebab-case for docs. ESLint lives in `eslint.config.mjs`; remove unused variables unless intentionally prefixed with `_`.

## Testing Guidelines

Root tests use `node:test` with `node:assert/strict`; add repository behavior tests under `tests/*.test.mjs`. Package tests belong in the relevant workspace and should expose a `test` script for `turbo test`.

## Task Completion Requirements

Before marking work complete, run the narrowest reliable validation. For most code changes, run `pnpm lint`, `pnpm typecheck`, and the most relevant targeted tests. Run full `pnpm test` for script, build, workspace wiring, or shared-contract changes, or when targeted tests do not cover the risk. Update tests, docs, and examples when behavior changes. Final handoff should name changed files, validation performed, and skipped checks with reasons.

Use `pnpm verify:fast` for the standard pre-commit gate and `pnpm verify` for the full repository gate. Prefer `pnpm verify` before handoff when changing root scripts, CI, Git hooks, workspace manifests, Turbo wiring, package exports, or shared contracts.

## Commit & Pull Request Guidelines

Use short, imperative, sentence-case commit subjects, e.g. `Add production start command and localize user list UI`. PRs should include a summary, validation, linked issues, and screenshots for visible UI changes.

## Design Context

The web app's design system is documented in `apps/web/PRODUCT.md` (strategy, brand, anti-references) and `apps/web/DESIGN.md` (visual spec: colors, typography, components, rules). Key facts:

- **Register:** product (app UI, not marketing). Design serves the task.
- **Palette:** Near-black base (`#0a0a0a`), single red accent (`#e63329`), gold/silver/bronze for podium/rewards. Light theme exists as a secondary mode.
- **Typography:** Bebas Neue (display numbers), Inter (body), JetBrains Mono (all UI labels at 10px uppercase 0.15em tracking).
- **Components:** TaskCard is the central interaction surface. Full-pill buttons, 8–12px card corners, flat-by-default (shadows only on primary buttons). Skeleton shimmer for all loading states.
- **Motion:** 150–200ms state transitions, no orchestrated page-load sequences. `prefers-reduced-motion` respected everywhere.
- **Anti-patterns:** No second accent color, no enterprise dashboard sprawl, no corporate wellness aesthetics, no gradient text, no ghost cards (border + shadow on same element).
- **Live mode:** Configured at `.impeccable/live/config.json`. Start the dev server, then `$impeccable live` to iterate in-browser.

## Security & Configuration Tips

Copy `.env.example` for local config. Keep secrets out of git and update `CORS_ORIGIN` for new frontend origins. Do not commit `dist/`, `.astro/`, `.turbo/`, or coverage artifacts.
