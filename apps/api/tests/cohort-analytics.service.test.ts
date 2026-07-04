import { describe, expect, it, vi } from 'vitest';
import {
  D7_COHORT_SQL,
  REMINDER_LATENCY_SQL,
  STREAK_SURVIVAL_SQL,
  getCohortReport,
  queryD7Cohort,
  queryReminderLatency,
  queryStreakSurvival,
} from '../src/services/cohort-analytics.service';

describe('cohort-analytics SQL shape', () => {
  it('D7 SQL anchors the window on registered_at, not cohort_week_start', () => {
    expect(D7_COHORT_SQL).toMatch(/u\.createdAt AS registered_at/);
    expect(D7_COHORT_SQL).toMatch(/pe\.createdAt >= c\.registered_at/);
    expect(D7_COHORT_SQL).toMatch(
      /pe\.createdAt < datetime\(c\.registered_at, '\+7 days'\)/,
    );
    expect(D7_COHORT_SQL).not.toMatch(/pe\.createdAt >= c\.cohort_week_start/);
    expect(D7_COHORT_SQL).toMatch(/eventKey = 'activity\.logged'/);
  });

  it('streak survival reads day.finalized currentStreak with thresholds', () => {
    expect(STREAK_SURVIVAL_SQL).toMatch(/eventKey = 'day\.finalized'/);
    expect(STREAK_SURVIVAL_SQL).toMatch(
      /json_extract\(pe\.metadata, '\$\.currentStreak'\)/,
    );
    expect(STREAK_SURVIVAL_SQL).toMatch(
      /VALUES \(1\), \(3\), \(7\), \(14\), \(30\)/,
    );
    // Aggregate-only output: final SELECT exposes counts/rates, never a userId.
    const finalSelect = STREAK_SURVIVAL_SQL.slice(
      STREAK_SURVIVAL_SQL.lastIndexOf('\nSELECT'),
    );
    expect(finalSelect).toMatch(/users_reached/);
    expect(finalSelect).toMatch(/survival_rate_pct/);
    expect(finalSelect).not.toMatch(/userId/);
  });

  it('reminder latency pairs reminder.sent with the next activity.logged in 24h', () => {
    expect(REMINDER_LATENCY_SQL).toMatch(/eventKey = 'reminder\.sent'/);
    expect(REMINDER_LATENCY_SQL).toMatch(/eventKey = 'activity\.logged'/);
    expect(REMINDER_LATENCY_SQL).toMatch(
      /al\.createdAt <= datetime\(r\.createdAt, '\+1 day'\)/,
    );
    expect(REMINDER_LATENCY_SQL).toMatch(/AVG\(latency_minutes\)/);
  });
});

describe('cohort-analytics query delegation', () => {
  it('queryD7Cohort runs the D7 statement', async () => {
    const rows = [
      {
        cohort_week_start: '2026-06-29',
        registered: 3,
        d7_checkin_users: 2,
        d7_checkin_rate_pct: 66.7,
      },
    ];
    const prisma = { $queryRawUnsafe: vi.fn().mockResolvedValue(rows) };
    const result = await queryD7Cohort(prisma);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(D7_COHORT_SQL);
    expect(result).toEqual(rows);
  });

  it('queryStreakSurvival runs the streak statement', async () => {
    const rows = [
      {
        streak_day: 1,
        users_reached: 5,
        base_users: 5,
        survival_rate_pct: 100,
      },
    ];
    const prisma = { $queryRawUnsafe: vi.fn().mockResolvedValue(rows) };
    const result = await queryStreakSurvival(prisma);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(STREAK_SURVIVAL_SQL);
    expect(result).toEqual(rows);
  });

  it('queryReminderLatency returns the first row', async () => {
    const row = {
      sample_count: 4,
      avg_latency_minutes: 42.5,
      min_latency_minutes: 1,
      max_latency_minutes: 120,
    };
    const prisma = { $queryRawUnsafe: vi.fn().mockResolvedValue([row]) };
    const result = await queryReminderLatency(prisma);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(REMINDER_LATENCY_SQL);
    expect(result).toEqual(row);
  });

  it('queryReminderLatency falls back to an empty row when no data', async () => {
    const prisma = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    const result = await queryReminderLatency(prisma);
    expect(result).toEqual({
      sample_count: 0,
      avg_latency_minutes: null,
      min_latency_minutes: null,
      max_latency_minutes: null,
    });
  });

  it('getCohortReport bundles all three aggregations', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        if (sql === D7_COHORT_SQL) return [{ cohort_week_start: '2026-06-29' }];
        if (sql === STREAK_SURVIVAL_SQL) return [{ streak_day: 1 }];
        if (sql === REMINDER_LATENCY_SQL) return [{ sample_count: 2 }];
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };

    const report = await getCohortReport(prisma as never);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
    expect(report.d7Cohort).toEqual([{ cohort_week_start: '2026-06-29' }]);
    expect(report.streakSurvival).toEqual([{ streak_day: 1 }]);
    expect(report.reminderLatency).toEqual({ sample_count: 2 });
    expect(() => new Date(report.generatedAt).toISOString()).not.toThrow();
  });
});
