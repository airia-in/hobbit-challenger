import { describe, expect, it } from 'vitest';
import { getUserLocalDate } from '../src/utils/day-window';
import {
  isDormantForWinback,
  isWinbackEligible,
  isWinbackMorningWindowActionable,
  isWinbackSuppressed,
  localCalendarDaysBetween,
  resolveWinbackMorningAnchors,
  shouldBlockOtherRemindersForWinback,
  shouldDeferRemindersForWinback,
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

  it('resets suppression when user logs after win-back on a later day', () => {
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

  it('resets suppression when user logs on the same local day as win-back', () => {
    const lastWinback = new Date('2026-06-12T12:00:00.000Z');
    const sameDayActivity = localDay('2026-06-12T08:00:00.000Z');
    const now = new Date('2026-06-14T12:00:00.000Z');
    expect(
      isWinbackSuppressed({
        lastWinbackSentAt: lastWinback,
        lastActivityDate: sameDayActivity,
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

  it('blocks other reminders while win-back owns the actionable morning window', () => {
    expect(
      shouldBlockOtherRemindersForWinback({
        winbackEligible: true,
        winbackSentToday: false,
        winbackMorningActionable: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockOtherRemindersForWinback({
        winbackEligible: true,
        winbackSentToday: false,
        winbackMorningActionable: false,
      }),
    ).toBe(false);

    expect(
      shouldBlockOtherRemindersForWinback({
        winbackEligible: false,
        winbackSentToday: true,
        winbackMorningActionable: false,
      }),
    ).toBe(true);
  });

  it('releases defer after morning window closes without SENT', () => {
    const lastLogDate = localDay('2026-06-12T08:00:00.000Z');
    const afterCatchUp = new Date('2026-06-15T12:16:00.000Z');

    expect(
      shouldDeferRemindersForWinback({
        lastActivityDate: lastLogDate,
        challengeStartDate: activeChallenge.startDate,
        challengeTimezone: TZ,
        challenge: activeChallenge,
        lastWinbackSentAt: null,
        winbackLogToday: null,
        reminderTime: '08:00',
        now: afterCatchUp,
      }),
    ).toBe(false);
  });

  it('defers during actionable morning window when eligible', () => {
    const lastLogDate = localDay('2026-06-12T08:00:00.000Z');
    const inCatchUp = new Date('2026-06-15T12:10:00.000Z');

    expect(
      isWinbackMorningWindowActionable({
        timezone: TZ,
        reminderTime: '08:00',
        winbackLogToday: null,
        now: inCatchUp,
      }),
    ).toBe(true);

    expect(
      shouldDeferRemindersForWinback({
        lastActivityDate: lastLogDate,
        challengeStartDate: activeChallenge.startDate,
        challengeTimezone: TZ,
        challenge: activeChallenge,
        lastWinbackSentAt: null,
        winbackLogToday: null,
        reminderTime: '08:00',
        now: inCatchUp,
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

describe('winback adaptive morning union window', () => {
  const lastLogDate = localDay('2026-06-12T08:00:00.000Z');

  it('keeps defer active in gap when adaptive shifts later than fixed time', () => {
    const inGap = new Date('2026-06-15T12:20:00.000Z');

    expect(
      isWinbackMorningWindowActionable({
        timezone: TZ,
        reminderTime: '08:00',
        effectiveMorningTime: '08:25',
        winbackLogToday: null,
        now: inGap,
      }),
    ).toBe(true);

    expect(
      shouldDeferRemindersForWinback({
        lastActivityDate: lastLogDate,
        challengeStartDate: activeChallenge.startDate,
        challengeTimezone: TZ,
        challenge: activeChallenge,
        lastWinbackSentAt: null,
        winbackLogToday: null,
        reminderTime: '08:00',
        effectiveMorningTime: '08:25',
        now: inGap,
      }),
    ).toBe(true);
  });

  it('defers before adaptive effective time when shift is earlier than fixed', () => {
    const atAdaptiveSlot = new Date('2026-06-15T11:30:00.000Z');

    expect(
      isWinbackMorningWindowActionable({
        timezone: TZ,
        reminderTime: '08:00',
        effectiveMorningTime: '07:30',
        winbackLogToday: null,
        now: atAdaptiveSlot,
      }),
    ).toBe(true);

    expect(
      shouldDeferRemindersForWinback({
        lastActivityDate: lastLogDate,
        challengeStartDate: activeChallenge.startDate,
        challengeTimezone: TZ,
        challenge: activeChallenge,
        lastWinbackSentAt: null,
        winbackLogToday: null,
        reminderTime: '08:00',
        effectiveMorningTime: '07:30',
        now: atAdaptiveSlot,
      }),
    ).toBe(true);
  });

  it('keeps FAILED win-back retry actionable in the earlier adaptive slot', () => {
    // Adaptive 07:30 (11:30Z) is earlier than fixed 08:00. A FAILED win-back at
    // 07:35 local (11:35Z) is inside the earlier slot's retry window but 25min
    // before the fixed anchor — it must still be owned by win-back, not dropped.
    const inEarlyRetry = new Date('2026-06-15T11:35:00.000Z');

    expect(
      isWinbackMorningWindowActionable({
        timezone: TZ,
        reminderTime: '08:00',
        effectiveMorningTime: '07:30',
        winbackLogToday: { status: 'FAILED' },
        now: inEarlyRetry,
      }),
    ).toBe(true);
  });

  it('releases union window after later anchor catch-up closes', () => {
    const afterUnion = new Date('2026-06-15T12:41:00.000Z');

    expect(
      isWinbackMorningWindowActionable({
        timezone: TZ,
        reminderTime: '08:00',
        effectiveMorningTime: '08:25',
        winbackLogToday: null,
        now: afterUnion,
      }),
    ).toBe(false);
  });

  it('orders anchors earliest-first regardless of input order', () => {
    expect(
      resolveWinbackMorningAnchors({
        reminderTime: '08:00',
        effectiveMorningTime: '07:30',
      }),
    ).toEqual(['07:30', '08:00']);
  });
});
