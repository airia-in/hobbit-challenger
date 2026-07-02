import { describe, expect, it } from 'vitest';
import { getUserLocalDate } from '../src/utils/day-window';
import {
  isDormantForWinback,
  isWinbackEligible,
  isWinbackSuppressed,
  localCalendarDaysBetween,
  shouldBlockOtherRemindersForWinback,
  shouldRetryWinback,
  WINBACK_DORMANT_DAYS_MIN,
  WINBACK_SUPPRESSION_DAYS,
} from '../src/utils/winback-dormancy';

const TZ = 'America/New_York';

function localDay(iso: string): Date {
  return getUserLocalDate(TZ, new Date(iso));
}

const activeChallenge = {
  startDate: localDay('2026-06-01T12:00:00.000Z'),
  endDate: localDay('2026-06-30T12:00:00.000Z'),
  lengthDays: 30,
  currentDay: 10,
  isActive: true,
  stoppedAt: null,
};

describe('winback dormancy detection', () => {
  it('counts 2 local days since last log as not dormant', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const lastLog = localDay('2026-06-13T12:00:00.000Z');
    expect(
      localCalendarDaysBetween(lastLog, getUserLocalDate(TZ, now), TZ),
    ).toBe(2);
    expect(
      isDormantForWinback(lastLog, activeChallenge.startDate, TZ, now),
    ).toBe(false);
  });

  it('counts 3 local days since last log as dormant', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const lastLog = localDay('2026-06-12T12:00:00.000Z');
    expect(
      isDormantForWinback(lastLog, activeChallenge.startDate, TZ, now),
    ).toBe(true);
  });

  it('respects timezone boundaries for dormancy', () => {
    const lastLog = getUserLocalDate(
      'Asia/Kolkata',
      new Date('2026-06-11T18:30:00.000Z'),
    );
    const now = new Date('2026-06-14T18:29:00.000Z');
    expect(
      isDormantForWinback(
        lastLog,
        activeChallenge.startDate,
        'Asia/Kolkata',
        now,
      ),
    ).toBe(false);

    const nowAfter = new Date('2026-06-14T18:31:00.000Z');
    expect(
      isDormantForWinback(
        lastLog,
        activeChallenge.startDate,
        'Asia/Kolkata',
        nowAfter,
      ),
    ).toBe(true);
  });

  it('treats any ActivityLog day as activity (non-scored counts)', () => {
    const now = new Date('2026-06-15T08:00:00.000Z');
    const lastLog = localDay('2026-06-14T08:00:00.000Z');
    expect(
      isDormantForWinback(lastLog, activeChallenge.startDate, TZ, now),
    ).toBe(false);
    expect(
      isWinbackEligible({
        lastActivityDate: lastLog,
        challengeStartDate: activeChallenge.startDate,
        challengeTimezone: TZ,
        challenge: activeChallenge,
        lastWinbackSentAt: null,
        now,
      }),
    ).toBe(false);
  });

  it('uses challenge start when user never logged', () => {
    const now = new Date('2026-06-04T08:00:00.000Z');
    expect(isDormantForWinback(null, activeChallenge.startDate, TZ, now)).toBe(
      true,
    );
  });
});

describe('winback suppression window', () => {
  const lastActivity = localDay('2026-06-10T08:00:00.000Z');

  it('suppresses within 7 local days of last successful win-back', () => {
    const lastWinback = new Date('2026-06-12T12:00:00.000Z');
    const now = new Date('2026-06-18T12:00:00.000Z');
    expect(
      isWinbackSuppressed({
        lastWinbackSentAt: lastWinback,
        lastActivityDate: lastActivity,
        timezone: TZ,
        now,
      }),
    ).toBe(true);
  });

  it('allows win-back after 7 local days without intervening activity', () => {
    const lastWinback = new Date('2026-06-01T12:00:00.000Z');
    const now = new Date('2026-06-15T12:00:00.000Z');
    expect(
      isWinbackSuppressed({
        lastWinbackSentAt: lastWinback,
        lastActivityDate: lastActivity,
        timezone: TZ,
        now,
      }),
    ).toBe(false);
  });

  it('resets suppression when user logs after win-back', () => {
    const lastWinback = new Date('2026-06-12T12:00:00.000Z');
    const activityAfterWinback = new Date('2026-06-13T08:00:00.000Z');
    const now = new Date('2026-06-14T12:00:00.000Z');
    expect(
      isWinbackSuppressed({
        lastWinbackSentAt: lastWinback,
        lastActivityDate: activityAfterWinback,
        timezone: TZ,
        now,
      }),
    ).toBe(false);
  });

  it('enforces full eligibility including suppression', () => {
    const lastLog = localDay('2026-06-01T08:00:00.000Z');
    const lastWinback = new Date('2026-06-10T12:00:00.000Z');
    const now = new Date('2026-06-15T12:00:00.000Z');
    expect(
      isWinbackEligible({
        lastActivityDate: lastLog,
        challengeStartDate: activeChallenge.startDate,
        challengeTimezone: TZ,
        challenge: activeChallenge,
        lastWinbackSentAt: lastWinback,
        now,
      }),
    ).toBe(false);
  });
});

describe('winback exclusions and precedence helpers', () => {
  it('excludes ended or stopped challenges', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    expect(
      isWinbackEligible({
        lastActivityDate: null,
        challengeStartDate: activeChallenge.startDate,
        challengeTimezone: TZ,
        challenge: { ...activeChallenge, isActive: false },
        lastWinbackSentAt: null,
        now,
      }),
    ).toBe(false);

    expect(
      isWinbackEligible({
        lastActivityDate: null,
        challengeStartDate: activeChallenge.startDate,
        challengeTimezone: TZ,
        challenge: {
          ...activeChallenge,
          stoppedAt: new Date('2026-06-20T00:00:00.000Z'),
        },
        lastWinbackSentAt: null,
        now,
      }),
    ).toBe(false);
  });

  it('blocks other reminders when win-back owns the day', () => {
    expect(
      shouldBlockOtherRemindersForWinback({
        winbackEligible: true,
        winbackSentToday: false,
        winbackPendingToday: false,
      }),
    ).toBe(true);

    expect(
      shouldBlockOtherRemindersForWinback({
        winbackEligible: false,
        winbackSentToday: true,
        winbackPendingToday: false,
      }),
    ).toBe(true);
  });

  it('shouldRetryWinback follows success-only dedupe', () => {
    expect(shouldRetryWinback(null)).toBe(true);
    expect(shouldRetryWinback({ status: 'FAILED' })).toBe(true);
    expect(shouldRetryWinback({ status: 'SENT' })).toBe(false);
    expect(shouldRetryWinback({ status: 'SKIPPED_OPTOUT' })).toBe(false);
  });

  it('documents dormant and suppression constants', () => {
    expect(WINBACK_DORMANT_DAYS_MIN).toBe(3);
    expect(WINBACK_SUPPRESSION_DAYS).toBe(7);
  });
});
