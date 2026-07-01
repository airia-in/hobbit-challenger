# DRCODE 75 HARD CHALLENGE — Implementation Plan

> **dailyhabbit** monorepo — Astro static frontend · NestJS + tRPC API · Prisma · SQLite (local) / libSQL (server) · OpenAI vision verification.

> ⚠️ **STATUS — SUPERSEDED AS THE ACTIVE PLAN.** This document describes the original
> **strict 75 Hard** mechanic: pass/fail elimination ("miss one task → restart Day 1"),
> AI vision verification as a hard gate, and required photo proof (incl. diet photos).
> The product has since pivoted to the **Discipline Challenge** (honor-system XP economy,
> one-tap logging, AI demoted to an optional background bonus). The **active, authoritative
> specs are the five phase docs in [`docs/superpowers/specs/`](./superpowers/specs/)**
> (Phase 1 Core → Phase 5 Custom Activities & Data).
>
> This doc is retained as the **future "hard mode" target**: per the agreed strategy, run
> the softer Discipline Challenge first; if it sustains engagement, evolve back toward the
> strict mechanic described here. Treat anything below that conflicts with the phase docs
> (elimination, AI gating, mandatory diet/progress photos, hardcoded 6-task forms) as the
> _future_ direction, not current scope.

---

## Project Overview

Build **DRCODE 75 HARD CHALLENGE** — a group accountability tracker for the 75 Hard mental toughness program. Users join groups via invite links, complete daily tasks with proof submissions, and compete on a shared leaderboard over 75 days. Miss one task → restart from Day 1.

**Tagline:** _No shortcuts. No excuses. No cheat days._

---

## Architecture

| Layer        | Location                                     | Role                                                               |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| Frontend     | `apps/web` — Astro static + React islands    | All product pages live here.                                       |
| API runtime  | `apps/api` — NestJS + Fastify on `:3001`     | All tRPC procedures, uploads, cron, and OpenAI calls.              |
| API contract | `apps/api` exports `AppRouter` type          | `apps/web` imports `AppRouter` as a type only.                     |
| Static host  | `apps/web-host` — serves staged Astro builds | Serves static Astro builds only — no API logic.                    |
| Shared UI    | `packages/ui`                                | DRCODE design-system components (`TaskCard`, `HeatmapGrid`, etc.). |
| Shared types | `packages/types`                             | Domain DTOs reused outside tRPC inference.                         |
| Database     | `packages/db`                                | Prisma schema, client, migrations. Consumed by `apps/api`.         |
| Deploy       | `docker-compose.yml` — `web-host` + `api`    | Two-service compose with shared DB volume + env vars.              |

### Request flow

```
Browser (Astro static + React islands)
    │
    ├─ GET  /dashboard, /leaderboard, …     → web-host (:4321) static files
    ├─ POST /trpc/*                         → api (:3001) NestJS + Fastify tRPC plugin
    ├─ POST /api/uploads/*                  → api multipart → disk volume
    └─ GET  /uploads/*                      → api serves proof files

apps/api (NestJS)
    ├─ src/trpc/          (routers, context, procedures)
    ├─ src/services/      (business logic, proof verifier)
    ├─ src/cron/          (day evaluator — @nestjs/schedule)
    ├─ packages/db        (Prisma → SQLite | libSQL)
    └─ OpenAI client      (vision verification, server-only)

apps/web-host
    └─ static Astro builds only
```

### Why keep NestJS separate

- **Static frontends aggregate in `web-host`, backends deploy independently.**
- NestJS gives structured modules, DI, and `@nestjs/schedule` for midnight day-evaluation cron jobs.
- tRPC already mounts on Fastify in `apps/api/src/main.ts` — extend that, don't rewrite.
- Astro stays fully static; the web app calls `PUBLIC_API_URL/trpc` (or a reverse proxy can unify origins in prod).

---

## Tech Stack

| Concern              | Choice                                                                      |
| -------------------- | --------------------------------------------------------------------------- |
| Monorepo             | PNPM workspaces + Turborepo (`dailyhabbit/`)                                |
| Frontend             | Astro 5 static + React islands + Tailwind CSS v4                            |
| API                  | NestJS 11 + Fastify + tRPC v11 (`apps/api`)                                 |
| ORM                  | Prisma (`packages/db`)                                                      |
| DB (local)           | SQLite (`file:./data/dev.db`)                                               |
| DB (server)          | libSQL via `@libsql/client` + Prisma `libsql` adapter (or Turso remote URL) |
| Auth                 | JWT in `Authorization: Bearer` header (extend `context.ts`)                 |
| File storage         | Local `data/uploads/` in dev; shared Docker volume in prod                  |
| AI verification      | OpenAI Vision API (`OPENAI_API_KEY`, `OPENAI_BASE_URL` from env)            |
| Cron / midnight jobs | `@nestjs/schedule` in `apps/api`                                            |
| QR codes             | `qrcode` npm package on invite page (client-side generation is fine)        |

### Environment variables

Extend `.env.example`:

```bash
# Frontend (build-time for Astro)
PUBLIC_API_URL=http://localhost:3001

# web-host runtime
PORT=4321
HOST=0.0.0.0
PRIMARY_FRONTEND=web

# api runtime (NestJS)
PORT=3001
CORS_ORIGIN=http://localhost:4321,http://127.0.0.1:4321
DATABASE_URL=file:./data/dev.db    # prod: libsql://...
JWT_SECRET=change-me
UPLOAD_DIR=./data/uploads
MAX_UPLOAD_BYTES=10485760

# OpenAI (api only — never PUBLIC_*)
OPENAI_API_KEY=
OPENAI_BASE_URL=                     # use global env value already configured
OPENAI_VISION_MODEL=gpt-4o-mini
```

---

## Monorepo Layout (after setup)

```text
dailyhabbit/
├── apps/
│   ├── web/                    # Astro static — all product UI
│   ├── web-host/               # Static file server only (unchanged role)
│   │   ├── src/server.ts
│   │   ├── Dockerfile
│   │   └── sites/              # staged Astro builds (gitignored)
│   └── api/                    # NestJS + Fastify + tRPC — all backend logic
│       ├── src/
│       │   ├── main.ts           # Fastify + tRPC plugin (existing)
│       │   ├── trpc/             # routers, context, procedures
│       │   ├── services/         # business logic, OpenAI verifier
│       │   ├── modules/          # NestJS modules (auth, tasks, groups, …)
│       │   └── cron/             # day-evaluator (@nestjs/schedule)
│       └── Dockerfile
├── packages/
│   ├── db/                     # Prisma schema + client
│   ├── ui/                     # shared React components
│   └── types/                  # shared domain types
├── data/                       # gitignored: sqlite db + uploads (local)
├── docker-compose.yml          # web-host + api
└── docs/
    └── drcode-75-hard-challenge-plan.md
```

### Initial setup

1. **Create `packages/db`** — Prisma init, schema (below), export `prisma` client.
2. **Grow `apps/api`** — add NestJS modules, services, and tRPC routers; wire Prisma via DI.
3. **Keep `apps/web-host` as-is** — static hosting only; no API routes added.
4. **Keep `apps/web/src/lib/trpc.ts`** — points at `PUBLIC_API_URL/trpc` (default `http://localhost:3001`).
5. **Extend `docker-compose.yml`** — add shared `data` volume + env vars to `api` service.

---

## Branding & Design System

### Color palette (CSS variables in `apps/web/src/styles/tokens.css`)

| Token              | Value     | Usage                    |
| ------------------ | --------- | ------------------------ |
| `--bg-black`       | `#0A0A0A` | Primary background       |
| `--surface`        | `#111111` | Cards and panels         |
| `--surface-raised` | `#1A1A1A` | Elevated components      |
| `--accent-red`     | `#E63329` | CTA, danger, streak fire |
| `--accent-orange`  | `#F97316` | Progress indicators      |
| `--gold`           | `#F5C842` | Rank 1, achievements     |
| `--silver`         | `#A8B2B8` | Rank 2                   |
| `--bronze`         | `#CD7F32` | Rank 3                   |
| `--text-primary`   | `#F0F0F0` | Main text                |
| `--text-muted`     | `#6B7280` | Secondary text           |
| `--success`        | `#22C55E` | Task completed           |
| `--border`         | `#2A2A2A` | Dividers                 |

### Typography

- **Display:** `Bebas Neue` or `Anton` — day counter, ranks, section headers.
- **Body:** `Inter` — task lists, UI copy.
- **Monospace:** `JetBrains Mono` — streak numbers, stats.

Load via Google Fonts in `apps/web/src/layouts/BaseLayout.astro`.

### Aesthetic

Dark military/athletic. Sharp edges, high contrast, red on black. Signature element: hero **DAY 42 / 75** in Bebas Neue on the dashboard.

### Shared components (`packages/ui`)

| Component          | Props / role                        |
| ------------------ | ----------------------------------- |
| `TaskCard`         | task, onSubmit, isCompleted         |
| `HeatmapGrid`      | daysData, adminMode, onDayLabelEdit |
| `DayCounter`       | currentDay, totalDays, startDate    |
| `StatsRow`         | stats object                        |
| `LeaderboardTable` | members, currentUserId              |
| `PodiumBlock`      | top3Members                         |
| `ProofUploader`    | onChange, preview, accept           |
| `GroupInviteCard`  | inviteUrl, groupName                |
| `StreakBadge`      | count                               |

---

## Pages & Routes (Astro)

Astro static pages with React islands for interactive sections. Use `client:load` or `client:visible` for task cards, heatmap, leaderboard.

| URL             | Astro page                 | Auth                              |
| --------------- | -------------------------- | --------------------------------- |
| `/`             | `pages/index.astro`        | Public — login/register           |
| `/join`         | `pages/join/index.astro`   | Protected — create/manage group   |
| `/join/[token]` | `pages/join/[token].astro` | Public → login redirect if needed |
| `/dashboard`    | `pages/dashboard.astro`    | Protected                         |
| `/leaderboard`  | `pages/leaderboard.astro`  | Protected                         |
| `/history`      | `pages/history.astro`      | Protected                         |
| `/profile`      | `pages/profile.astro`      | Protected                         |
| `/admin/group`  | `pages/admin/group.astro`  | Protected — group admin only      |

**Auth guard pattern:** React `AuthGate` island checks session via `trpc.auth.me`; redirects to `/` if unauthenticated. For static Astro, do not rely on server middleware — guard in client + API rejects unauthenticated calls.

**Post-login routing:**

- No group → `/join`
- Has group → `/dashboard`

### Mobile navigation

Bottom nav (mobile): Dashboard · Leaderboard · History · Profile.  
Desktop: fixed left sidebar.

---

## Feature Specs

### 1. Login / Register (`/`)

- Full-screen dark background, centered card (max 420px).
- Logo: **DRCODE** (red) + **75 HARD CHALLENGE** (white).
- Tabs: Sign In | Register.
- Footer: _"75 days. 5 tasks. No exceptions."_

**tRPC:** `auth.register`, `auth.login`, `auth.logout`, `auth.me`

### 2. Group Invite & Join

#### `/join` — Create or manage group

- One group per user (create OR belong, not both).
- Create group → invite link `https://<host>/join/{token}` + QR + copy/WhatsApp share.
- Member list: avatar, name, current day, status (Active / Eliminated / Completed).
- Admin (creator): remove member, regenerate invite token.

**tRPC:** `groups.create`, `groups.getMine`, `groups.regenerateInvite`, `groups.removeMember`, `groups.transferAdmin`

#### `/join/[token]` — Join via link

- Show group name + member count.
- Not logged in → redirect to `/` with `?returnTo=/join/{token}`.
- On join → `/dashboard` (user starts at Day 1 with own start date).

**tRPC:** `groups.previewByToken`, `groups.join`

### 3. Dashboard (`/dashboard`)

#### 3a. Hero — Day Counter

- Massive `DAY {n} / 75` + progress bar + start / estimated finish dates.
- Red banner if yesterday failed: _"You missed a task yesterday. Your streak has reset to Day 1."_
- Count-up animation on load.

#### 3b. Today's tasks (6 task types)

| #   | Task                        | Icon | Proof                             | AI verify                         |
| --- | --------------------------- | ---- | --------------------------------- | --------------------------------- |
| 1   | Follow Your Diet            | 🥗   | Checkbox + optional photo         | Photo: meal plausibility          |
| 2   | Outdoor Workout (45 min)    | 🌳   | Photo (+ optional GPS screenshot) | Outdoor activity cues             |
| 3   | Indoor Workout (45 min)     | 💪   | Photo                             | Gym/indoor workout cues           |
| 4   | Drink 1 Gallon of Water     | 💧   | Photo of bottle/jug               | Water container visible           |
| 5   | Read 10 Pages (non-fiction) | 📖   | Book title + page range           | N/A (text validation only)        |
| 6   | Progress Photo              | 📸   | Full-body photo (required)        | Person visible, full-body framing |

- Cards collapsed by default; expand for proof UI.
- Status: `PENDING` | `COMPLETED` | `OVERDUE` | `REJECTED` (AI failed).
- Submissions lock at **11:59 PM user local timezone**.
- Editable until midnight same day.

**tRPC:** `tasks.getToday`, `tasks.submit`, `tasks.updateProof`

#### 3c. Consistency stats

Current streak · Longest streak · Total days completed · Success rate · Total XP.

**tRPC:** `stats.getDashboard`

#### 3d. 75-day heatmap

Cell states: completed (green) · failed (red) · future (grey) · today (gold) · not started (muted).

Admin can set group-wide day labels (tooltip on hover). Edit mode toggle for group admin.

**tRPC:** `heatmap.get`, `heatmap.setDayLabel` (admin)

### 4. Leaderboard (`/leaderboard`)

- Top-3 podium + full table scoped to user's group.
- Sort: current day (default) · success rate · streak · alphabetical.
- Expand row → last 7 days mini-heatmap + yesterday proof thumbnails.
- Status badges: `ACTIVE` | `COMPLETED`.
- Auto-refresh every 60s.

**tRPC:** `leaderboard.get`

### 5. History (`/history`)

- Filter: all tasks · by type · date range.
- Failed days: red left border.
- Restart events: full-width red banner.

**tRPC:** `history.list`, `history.exportCsv`

### 6. Profile (`/profile`)

- Display name, email, avatar.
- Change password, leave group (confirm modal).
- Daily reminder time (browser `Notification` API).
- Export data CSV.

**tRPC:** `profile.get`, `profile.update`, `profile.leaveGroup`

---

## Core Business Rules

### Day tracking

- Day window: **midnight → 11:59:59 PM** in user's stored timezone (`users.timezone`, detected on first login).
- All **6 tasks** must be completed and accepted before midnight.
- Cron (`day-evaluator`) runs every minute (or hourly with per-TZ batching): for users whose local date rolled over, evaluate previous day → mark failed + archive attempt + reset to Day 1 if incomplete.
- History preserved across attempts (`attempts` table).

### Proof validation

| Type        | Server rules                              | OpenAI                                                                |
| ----------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Photo tasks | JPEG/PNG, max 10MB, stored on disk        | Vision: task-specific prompt, return `{ passed, confidence, reason }` |
| Reading     | `pageTo - pageFrom >= 10`, title required | —                                                                     |
| Diet        | Checkbox required                         | Optional photo AI check                                               |

- Submissions immutable after midnight.
- `task_logs.ai_verdict`, `ai_confidence`, `ai_reason` stored for transparency.
- **Policy:** AI rejection shows reason; user can re-submit before midnight. Group members can view all proofs (accountability).

### Group rules

- One group per user.
- Recommended size 2–20.
- Creator is admin; can transfer admin.
- Joining mid-challenge: user starts Day 1 on their own timeline; appears on shared leaderboard.

### Restart logic

- Failed day → archive current `attempt`, increment `attempt_number`, reset `current_day` to 1.
- Leaderboard shows Day 0 / Eliminated until Day 1 completed again.

---

## OpenAI Vision Integration

Server-only NestJS service: `apps/api/src/services/proof-verifier.service.ts`.

```typescript
// Pseudocode — use env OPENAI_API_KEY + OPENAI_BASE_URL
async function verifyProof(
  taskType: TaskType,
  imageUrl: string,
): Promise<Verdict> {
  const prompt = TASK_PROMPTS[taskType]; // per-task rubric
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL ?? 'gpt-4o-mini',
    messages: [
      { role: 'system', content: prompt.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt.user },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  });
  return parseVerdict(response);
}
```

**Per-task prompts (store in `apps/api/src/prompts/`):**

- `outdoor-workout.md` — person exercising outdoors, daylight/sky/trees cues.
- `indoor-workout.md` — gym/indoor exercise context.
- `water.md` — gallon jug or large water container.
- `progress-photo.md` — full-body person, no heavy filters.
- `diet.md` — (optional) plate of food, not junk obvious cheat meal.

**Failure handling:** If OpenAI is down, allow submission with `ai_verdict: 'SKIPPED'` and flag for manual review — do not block the user entirely.

---

## Database Schema (Prisma)

`packages/db/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"       // use libsql adapter at runtime for prod
  url      = env("DATABASE_URL")
}

enum TaskType {
  DIET
  OUTDOOR_WORKOUT
  INDOOR_WORKOUT
  WATER
  READING
  PROGRESS_PHOTO
}

enum MemberStatus {
  ACTIVE
  COMPLETED
}

enum AiVerdict {
  PASSED
  FAILED
  SKIPPED
}

model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  passwordHash  String
  timezone      String    @default("UTC")
  avatarUrl     String?
  groupId       String?
  group         Group?    @relation(fields: [groupId], references: [id])
  reminderTime  String?   // "HH:mm" local
  createdAt     DateTime  @default(now())
  attempts      Attempt[]
  taskLogs      TaskLog[]
  adminOf       Group[]   @relation("GroupAdmin")
}

model Group {
  id            String      @id @default(cuid())
  name          String
  inviteToken   String      @unique
  adminUserId   String
  admin         User        @relation("GroupAdmin", fields: [adminUserId], references: [id])
  members       User[]
  dayLabels     DayLabel[]
  createdAt     DateTime    @default(now())
}

model Attempt {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  attemptNumber   Int
  startDate       DateTime
  endDate         DateTime?
  isActive        Boolean   @default(true)
  currentDay      Int       @default(1)
  longestStreak   Int       @default(0)
  taskLogs        TaskLog[]
  dayResults      DayResult[]
}

model DayResult {
  id          String   @id @default(cuid())
  attemptId   String
  attempt     Attempt  @relation(fields: [attemptId], references: [id])
  date        DateTime // calendar date in user TZ
  dayNumber   Int
  completed   Boolean
  failedAt    DateTime?
  failReason  String?
}

model TaskLog {
  id            String    @id @default(cuid())
  attemptId     String
  attempt       Attempt   @relation(fields: [attemptId], references: [id])
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  taskType      TaskType
  date          DateTime
  completedAt   DateTime?
  proofUrl      String?
  proofNotes    String?
  bookTitle     String?
  pageFrom      Int?
  pageTo        Int?
  dietConfirmed Boolean   @default(false)
  aiVerdict     AiVerdict?
  aiConfidence  Float?
  aiReason      String?
  isValid       Boolean   @default(true)
}

model DayLabel {
  id          String   @id @default(cuid())
  groupId     String
  group       Group    @relation(fields: [groupId], references: [id])
  dayNumber   Int      // 1–75
  labelText   String
  setByUserId String
  updatedAt   DateTime @updatedAt

  @@unique([groupId, dayNumber])
}
```

### libSQL production notes

- Use `@prisma/adapter-libsql` + `@libsql/client` when `DATABASE_URL` starts with `libsql://`.
- Mount a volume at `/app/data` in Docker for SQLite file **or** point to Turso/libSQL remote.
- Run `prisma migrate deploy` on container start (entrypoint script).

---

## tRPC Router Map

`apps/api/src/trpc/router.ts`:

```text
auth
  .register(name, email, password)
  .login(email, password)
  .logout()
  .me()

groups
  .create(name)
  .getMine()
  .previewByToken(token)
  .join(token)
  .regenerateInvite()
  .removeMember(userId)
  .transferAdmin(userId)

tasks
  .getToday()
  .submit(input)
  .updateProof(input)

stats
  .getDashboard()

heatmap
  .get()
  .setDayLabel(dayNumber, labelText)   // admin

leaderboard
  .get(sortBy)

history
  .list(filters)
  .exportCsv()

profile
  .get()
  .update(input)
  .leaveGroup()
```

Follow [trpc-feature-flow skill](../.agents/skills/trpc-feature-flow/SKILL.md): zod inputs, `publicProcedure` vs `protectedProcedure`, real JWT in `context.ts`.

---

## NestJS API Changes

Extend `apps/api` — tRPC is already mounted on Fastify in `main.ts`. Add:

### NestJS modules

```text
AppModule
├── PrismaModule          # provides PrismaClient from packages/db
├── AuthModule            # JWT sign/verify, password hashing
├── GroupsModule
├── TasksModule
├── StatsModule
├── LeaderboardModule
├── UploadModule          # Fastify multipart + static /uploads
└── ScheduleModule        # @nestjs/schedule for day evaluator
```

### New routes (Fastify, alongside `/trpc`)

- `POST /api/uploads` — multipart file upload → save to `UPLOAD_DIR` → return `{ url }`
- `GET /uploads/*` — serve proof files from `UPLOAD_DIR`

Register these on the Fastify instance in `main.ts` (same pattern as the existing `fastifyTRPCPlugin` registration).

### Cron — day evaluator

Use `@nestjs/schedule` with a `@Cron()` job (e.g. every minute) in `apps/api/src/cron/day-evaluator.service.ts`:

- Query users whose local timezone date just rolled over.
- Evaluate previous day: all 6 tasks complete + AI passed → mark day complete; else fail + restart.

### Prisma in NestJS

```typescript
// apps/api/src/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

Inject `PrismaService` into tRPC context via `createContext` (pass from NestJS app context or a global provider).

### Dockerfile updates (`apps/api/Dockerfile`)

- Add `packages/db` to COPY + build steps.
- Run `prisma generate` during build.
- Entrypoint: `prisma migrate deploy && node dist/main`.
- Mount shared `app-data` volume at `/app/data`.

`apps/web-host/Dockerfile` stays unchanged (static builds only).

---

## Docker Compose (two services)

Extend the stock `docker-compose.yml`:

```yaml
services:
  web-host:
    build:
      context: .
      dockerfile: apps/web-host/Dockerfile
      args:
        PUBLIC_API_URL: ${PUBLIC_API_URL:-http://localhost:3001}
    environment:
      NODE_ENV: production
      PORT: 4321
      HOST: 0.0.0.0
      PRIMARY_FRONTEND: web
    ports:
      - '${WEB_PORT:-4321}:4321'
    depends_on:
      api:
        condition: service_started

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      NODE_ENV: production
      PORT: 3001
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:4321,http://127.0.0.1:4321}
      DATABASE_URL: ${DATABASE_URL:-file:/app/data/prod.db}
      JWT_SECRET: ${JWT_SECRET}
      UPLOAD_DIR: /app/data/uploads
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_BASE_URL: ${OPENAI_BASE_URL}
      OPENAI_VISION_MODEL: ${OPENAI_VISION_MODEL:-gpt-4o-mini}
    ports:
      - '${API_PORT:-3001}:3001'
    volumes:
      - app-data:/app/data

volumes:
  app-data:
```

Root `pnpm start` stays as-is (builds frontends, runs web-host + api in parallel).

**Production tip:** put a reverse proxy in front to serve both from one origin — e.g. `/` → web-host, `/trpc` + `/uploads` → api — so `PUBLIC_API_URL` can be empty and CORS is not needed.

---

## Notifications

| Trigger        | Mechanism                                                                         |
| -------------- | --------------------------------------------------------------------------------- |
| Daily reminder | Browser `Notification` + `localStorage` schedule (user opt-in on Profile)         |
| 10 PM warning  | Client-side check while app is open; optional future: Web Push via service worker |
| Group activity | In-app toast on dashboard when polling `leaderboard.get` detects changes          |

v2: server-sent events or WebSocket in `apps/api` for live feed.

---

## In-App Copy — The 5 Rules

Display on `/join`, onboarding, and collapsible dashboard section:

1. **Follow a Diet** — No cheat meals. No alcohol.
2. **Two 45-Minute Workouts** — One outdoors. Separate by a few hours.
3. **Drink 1 Gallon of Water (3.8L)** — Spread throughout the day.
4. **Read 10 Pages of Non-Fiction** — Audiobooks do not count.
5. **Take a Progress Photo** — Full-body, daily, no filters.

**THE IRON RULE:** Miss any task on any day → restart from Day 1.

---

## Implementation Phases

### Phase 0 — Foundation

- [ ] Create `packages/db` with Prisma + SQLite
- [ ] Add `PrismaModule` to `apps/api`
- [ ] Extend `apps/api` Dockerfile for Prisma generate + migrate
- [ ] Extend `docker-compose.yml` with shared `data` volume + API env vars
- [ ] Add upload routes on Fastify (`/api/uploads`, `/uploads/*`)
- [ ] Add `@nestjs/schedule` + day-evaluator cron skeleton

### Phase 1 — Auth & groups

- [ ] JWT auth in tRPC context
- [ ] Register / login / logout pages
- [ ] Group create, invite link, QR, join flow
- [ ] Protected route guards

### Phase 2 — Dashboard core

- [ ] Day counter + progress bar
- [ ] Six task cards with proof upload
- [ ] Midnight day evaluator cron
- [ ] Restart / attempt archival logic
- [ ] Stats row

### Phase 3 — AI verification

- [ ] OpenAI vision service per task type
- [ ] Store verdict on `TaskLog`
- [ ] Rejection UX with reason + re-submit

### Phase 4 — Social & history

- [ ] 75-day heatmap + admin day labels
- [ ] Leaderboard + podium
- [ ] History log + CSV export
- [ ] Profile page

### Phase 5 — Polish & deploy

- [ ] DRCODE branding + typography
- [ ] Mobile bottom nav + responsive layouts
- [ ] Docker volume + libSQL prod config
- [ ] Deploy adapter for target host
- [ ] `pnpm verify` green

---

## Launch Checklist

- [ ] Auth flows (register, login, logout, password change)
- [ ] Group creation + invite link + QR code
- [ ] All 6 task types with proof submission
- [ ] OpenAI vision verification for photo tasks
- [ ] Midnight cron evaluates day completion and triggers resets
- [ ] Day counter + progress bar
- [ ] Consistency stats block
- [ ] 75-day heatmap with tooltips
- [ ] Heatmap day label customization (admin)
- [ ] Group leaderboard with podium
- [ ] History/log page
- [ ] Mobile-responsive layout
- [ ] Browser notification opt-in
- [ ] Proof photos on disk (not base64 in DB)
- [ ] Protected API procedures
- [ ] Docker deploy (web-host + api containers)
- [ ] DRCODE 75 HARD branding throughout

---

## Future (v2)

- Apple Health / Google Fit workout duration sync
- Stronger AI validation (NSFW filter, anti-spoof)
- Group chat / reaction feed
- Custom challenge templates (30/60-day variants)
- Weekly summary email
- Public Wall of Fame for 75-day finishers
- Web Push server for midnight warnings

---

## Local Development

```bash
cd dailyhabbit
pnpm install

# Terminal 1 — DB migrate
pnpm --filter @workspace-starter/db exec prisma migrate dev

# Terminal 2 — NestJS API (tRPC on :3001)
pnpm --filter @workspace-starter/api dev

# Terminal 3 — Astro dev (hot reload on :4321)
pnpm --filter @workspace-starter/web dev
```

Or run everything together:

```bash
pnpm dev
```

For integrated local prod simulation:

```bash
pnpm start
# → web: http://127.0.0.1:4321
# → api: http://localhost:3001/trpc
```

---

_DRCODE 75 HARD CHALLENGE — Build it hard. Use it harder._
