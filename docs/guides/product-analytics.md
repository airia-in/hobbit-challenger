# Product analytics (#148)

Lightweight `ProductEvent` rows support retention cohort metrics without a third-party SDK. Writes are gated by `PRODUCT_ANALYTICS_ENABLED` (default **on** when unset; set `false` in test/CI).

## Event catalog

| `eventKey`               | When emitted                                                      | Metadata (no PII)                                                       |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `activity.logged`        | Scored/personal activity mutation                                 | `activityId`, `challengeId`, `activityKind`, `scored`                   |
| `day.finalized`          | Day evaluator finalizes yesterday                                 | `challengeId`, `dayNumber`, `allScoredLogged`, `netXp`, `currentStreak` |
| `streak.broken`          | Streak reset to 0 (no freeze)                                     | `challengeId`, `previousStreak`                                         |
| `streak.freeze_consumed` | Rain-cloak freeze used                                            | `challengeId`, `currentStreak`                                          |
| `reminder.sent`          | WhatsApp send attempt (cron + ack/winback/recap/milestone/freeze) | `kind`, `status` (`SENT` / `FAILED`)                                    |
| `milestone.unlocked`     | Milestone unlock on finalize                                      | `milestoneKey`, `challengeId`                                           |
| `user.registered`        | Auth register                                                     | `timezone`                                                              |
| `group.joined`           | Group join via invite                                             | `groupId`                                                               |

## Example SQL: D7 check-in rate by cohort week

SQLite — users registered per ISO week with at least one `activity.logged` event within 7 days:

```sql
WITH cohorts AS (
  SELECT
    u.id AS user_id,
    date(u.createdAt, 'weekday 1', '-6 days') AS cohort_week_start
  FROM User u
),
d7_checkins AS (
  SELECT DISTINCT c.user_id
  FROM cohorts c
  INNER JOIN ProductEvent pe ON pe.userId = c.user_id
  WHERE pe.eventKey = 'activity.logged'
    AND pe.createdAt < datetime(c.cohort_week_start, '+7 days')
    AND pe.createdAt >= c.cohort_week_start
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

Alternative using raw activity logs (same cohort definition):

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
