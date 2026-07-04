# Production Start E2E Sweep

Date: 2026-07-01

Setup (first run only): `pnpm e2e:install` to download the Chromium browser
Playwright drives. On Linux CI, use `pnpm exec playwright install --with-deps
chromium` to also pull system dependencies.

Command: `pnpm e2e`

The automated sweep boots the app through the real root `pnpm start` command
against a throwaway SQLite database and runs the Chromium Playwright specs in
`e2e/`. Each spec is split into serial blocks that share isolated browser
contexts, so a block keeps its own per-test timeout budget while the app boots
only once. Shared setup helpers (registration, group create/join, browser-user
fixtures) live in `e2e/helpers.ts`.

## Automated Coverage

- Auth: phone registration with the `+91` UI prefix for three users.
- Groups: admin creates a group, copies the invite URL, member joins via invite,
  and the member appears in the admin's group list.
- Today: seeded sub-point, number, tiered, and checkbox/proof activities are
  exercised from the browser.
- Proof uploads: Progress photo proof upload is surfaced on Today and accepted
  by the authenticated upload route.
- Leaderboard, Progress, History, Gallery: pages are visited after activity
  logging; leaderboard verifies both users, gallery verifies the proof entry.
- Personal-only path: a groupless user creates and logs a personal activity.
- Profile: WhatsApp reminder opt-in toggle and save path are exercised.
- Browser health: the spec fails on unexpected page errors or console errors.

### Admin / group edge flows (`e2e/admin-group-edge.spec.ts`)

- Invite: an admin regenerates the invite link and the token rotates.
- Admin management: an admin promotes a member to co-admin and then demotes
  them, verifying the Admin badge toggles.
- Activity editing: an admin renames a scored activity and the list re-renders
  with the new title.
- Guards: a non-admin member is blocked from `/admin/group` and
  `/admin/activities`, and a groupless user is guided to onboarding and blocked
  from both admin pages.
- Leave group: a member leaves via the profile confirm modal.
- Remove member: an admin removes a member, who then drops back to the
  group-onboarding choice.

## Remaining Manual Or Follow-Up Coverage

- Group heatmap day-label editing and challenge-range workflows.
- Dissolve-group path (sole admin, last member) and the blocked "transfer admin
  first" branch.
- Avatar upload display and CSV download contents.
- Forced API-failure retry states beyond the unit/component coverage.
- Day finalizer time travel for grouped and personal-only users.
- `pnpm dev` browser sweep. The repeatable suite currently targets
  production `pnpm start`; adding a dev-server variant should be a separate,
  explicit lane because the root dev command is long-running and watcher based.
