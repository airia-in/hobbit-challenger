# Product analytics (#148)

Lightweight `ProductEvent` rows support retention cohort metrics without a third-party SDK. Writes are gated by `PRODUCT_ANALYTICS_ENABLED` (default **on** when unset; set `false` in test/CI).

## Event catalog

| `eventKey`               | When emitted                                                             | Metadata (no PII)                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity.logged`        | Scored/personal activity mutation                                        | `activityId`, `challengeId`, `activityKind`, `scored`                                                                                                                                                                                                    |
| `day.finalized`          | Day evaluator finalizes yesterday                                        | `challengeId`, `dayNumber`, `allScoredLogged`, `netXp`, `currentStreak`                                                                                                                                                                                  |
| `streak.broken`          | Streak reset to 0 (no freeze)                                            | `challengeId`, `previousStreak`                                                                                                                                                                                                                          |
| `streak.freeze_consumed` | Rain-cloak freeze used                                                   | `challengeId`, `currentStreak`                                                                                                                                                                                                                           |
| `reminder.sent`          | Successful WhatsApp delivery (cron + ack/winback/recap/milestone/freeze) | `kind`, `status` (`SENT` only). Check-in acks use **`CHECKIN_ACK_FIRST`** (first scored log of the local day, #173) and **`CHECKIN_ACK`** (all scored habits logged, #140); multi-habit days may emit both — count or roll up both kinds for ack volume. |
| `milestone.unlocked`     | Milestone unlock on finalize                                             | `milestoneKey`, `challengeId`                                                                                                                                                                                                                            |
| `milestone.shared`       | Share-card download (web) or WhatsApp media delivery (#174)              | `milestoneKey`, `channel` (`web` \| `whatsapp`)                                                                                                                                                                                                          |
| `user.registered`        | Auth register                                                            | `timezone`                                                                                                                                                                                                                                               |
| `group.joined`           | Group join via invite                                                    | `groupId`                                                                                                                                                                                                                                                |

## D7 check-in rate by cohort week

Each user's D7 window is anchored on **registration time** (`registered_at` through `registered_at + 7 days`). `cohort_week_start` is used only for bucketing users into ISO weeks.

### Admin script

```bash
DATABASE_URL="file:./packages/db/prisma/dev.db" node scripts/analytics/d7-cohort.mjs
```

Prints JSON rows: `cohort_week_start`, `registered`, `d7_checkin_users`, `d7_checkin_rate_pct`.

## Admin read API (#184)

Cohort metrics are also exposed as read-only, admin-gated tRPC queries so
learning from them no longer requires shell access. Auth is an **env-gated admin
token** (cohort metrics are cross-user, so per-group admin roles do not apply):
set `ADMIN_ANALYTICS_TOKEN` and send it on the `x-admin-token` header. The
surface **fails closed** when the env var is unset. Responses are aggregate
counts/rates only — no per-user rows, no PII.

| Procedure                   | Returns                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `analytics.d7Cohort`        | D7 check-in rate per registration cohort week (same SQL as the script below).               |
| `analytics.streakSurvival`  | Streak survival curve: users reaching streak `>= {1,3,7,14,30}` from `day.finalized`.       |
| `analytics.reminderLatency` | Reminder → next check-in latency (minutes): `sample_count`, `avg`, `min`, `max` within 24h. |
| `analytics.report`          | Combined payload bundling all three plus `generatedAt`.                                     |

Each procedure runs a single bounded SQL statement (no application N+1) over the
`ProductEvent` indexes `(eventKey, createdAt)` and `(userId, createdAt)`. The SQL
lives in `apps/api/src/services/cohort-analytics.service.ts`.

### Example SQL (ProductEvent)

SQLite — users registered per ISO week with at least one `activity.logged` event within 7 days of registration:

```sql
WITH cohorts AS (
  SELECT
    u.id AS user_id,
    u.createdAt AS registered_at,
    date(u.createdAt, 'weekday 1', '-6 days') AS cohort_week_start
  FROM User u
),
d7_checkins AS (
  SELECT DISTINCT c.user_id
  FROM cohorts c
  INNER JOIN ProductEvent pe ON pe.userId = c.user_id
  WHERE pe.eventKey = 'activity.logged'
    AND pe.createdAt >= c.registered_at
    AND pe.createdAt < datetime(c.registered_at, '+7 days')
)
SELECT
  cohort_week_start,
  COUNT(*) AS registered,
  COUNT(d7.user_id) AS d7_checkin_users,
  ROUND(100.0 * COUNT(d7.user_id) / COUNT(*), 1) AS d7_checkin_rate_pct
FROM cohorts c
LEFT JOIN d7_checkins d7 ON d7.user_id = c.user_id
GROUP BY cohort_week_start
ORDER BY cohort_week_start;
```

Alternative using raw activity logs (same per-user D7 window):

```sql
WITH cohorts AS (
  SELECT
    u.id AS user_id,
    u.createdAt AS registered_at,
    date(u.createdAt, 'weekday 1', '-6 days') AS cohort_week_start
  FROM User u
)
SELECT
  cohort_week_start,
  COUNT(*) AS registered,
  SUM(
    CASE WHEN EXISTS (
      SELECT 1
      FROM ActivityLog al
      WHERE al.userId = c.user_id
        AND al.createdAt IS NOT NULL
        AND datetime(al.date / 1000, 'unixepoch') >= c.registered_at
        AND datetime(al.date / 1000, 'unixepoch') < datetime(c.registered_at, '+7 days')
    ) THEN 1 ELSE 0 END
  ) AS d7_checkin_users
FROM cohorts c
GROUP BY cohort_week_start
ORDER BY cohort_week_start;
```
