import { describe, expect, it } from 'vitest';
import {
  computeWeeklyRecapEligibleRange,
  getWeeklyRecapLogDate,
  getWeeklyRecapSkipReason,
  getWeeklyRecapTimezone,
  getWeeklyRecapWeekKeys,
  isLocalSunday,
  isWeeklyRecapEligible,
  isWeeklyRecapSlotDue,
  isWeeklyRecapSundaySweepDue,
  isWeeklyRecapWindowActionable,
  WEEKLY_RECAP_KIND,
  WEEKLY_RECAP_MIN_ELIGIBLE_DAYS,
} from '../src/utils/weekly-recap-eligibility';
import { getRollupEligibleRangeForTest } from '../src/utils/weekly-recap-rollup';

const TZ = 'UTC';
const SUNDAY = new Date('2026-06-28T10:00:00.000Z');
const SATURDAY = new Date('2026-06-27T10:00:00.000Z');

function challenge(
  overrides: Partial<{
    startDate: Date;
    endDate: Date | null;
    lengthDays: number;
    currentDay: number;
    isActive: boolean;
    stoppedAt: Date | null;
  }> = {},
) {
  return {
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-30T00:00:00.000Z'),
    lengthDays: 30,
    currentDay: 15,
    isActive: true,
    stoppedAt: null,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof getWeeklyRecapSkipReason>[0]> = {},
) {
  return {
    challenge: challenge(),
    challengeTimezone: TZ,
    lastActivityDate: new Date('2026-06-27T00:00:00.000Z'),
    lastWinbackSentAt: null,
    activityDatesInWeek: ['2026-06-27'],
    weeklyRecapOptIn: true,
    whatsappOptIn: true,
    hasPhone: true,
    now: SUNDAY,
    ...overrides,
  };
}

describe('weekly-recap eligibility matrix', () => {
  it('requires phone, whatsapp, and weekly recap opt-in', () => {
    expect(getWeeklyRecapSkipReason(baseInput({ hasPhone: false }))).toBe(
      'no_phone',
    );
    expect(getWeeklyRecapSkipReason(baseInput({ whatsappOptIn: false }))).toBe(
      'no_whatsapp',
    );
    expect(
      getWeeklyRecapSkipReason(baseInput({ weeklyRecapOptIn: false })),
    ).toBe('opt_out');
  });

  it('only fires on local Sunday', () => {
    expect(getWeeklyRecapSkipReason(baseInput())).toBe(null);
    expect(getWeeklyRecapSkipReason(baseInput({ now: SATURDAY }))).toBe(
      'not_sunday',
    );
  });

  it('skips when challenge ended before the ISO week', () => {
    expect(
      getWeeklyRecapSkipReason(
        baseInput({
          challenge: challenge({
            endDate: new Date('2026-06-21T00:00:00.000Z'),
            isActive: false,
            stoppedAt: new Date('2026-06-21T00:00:00.000Z'),
          }),
        }),
      ),
    ).toBe('challenge_ended_before_week');
  });

  it('skips mid-week join with fewer than 3 eligible days', () => {
    const range = computeWeeklyRecapEligibleRange(
      challenge({ startDate: new Date('2026-06-27T00:00:00.000Z') }),
      TZ,
      SUNDAY,
    );
    expect(range.eligibleDays).toBeLessThan(WEEKLY_RECAP_MIN_ELIGIBLE_DAYS);
    expect(
      getWeeklyRecapSkipReason(
        baseInput({
          challenge: challenge({
            startDate: new Date('2026-06-27T00:00:00.000Z'),
          }),
          activityDatesInWeek: ['2026-06-27', '2026-06-28'],
        }),
      ),
    ).toBe('insufficient_eligible_days');
  });

  it('skips zero-activity weeks', () => {
    expect(
      getWeeklyRecapSkipReason(baseInput({ activityDatesInWeek: [] })),
    ).toBe('zero_activity');
  });

  it('defers to winback for dormant users with prior week activity', () => {
    expect(
      getWeeklyRecapSkipReason(
        baseInput({
          lastActivityDate: new Date('2026-06-25T00:00:00.000Z'),
          activityDatesInWeek: ['2026-06-25'],
        }),
      ),
    ).toBe('winback_precedence');
  });

  it('skips dormant users with zero activity in the eligible week', () => {
    expect(
      getWeeklyRecapSkipReason(
        baseInput({
          lastActivityDate: new Date('2026-06-20T00:00:00.000Z'),
          activityDatesInWeek: [],
        }),
      ),
    ).toBe('zero_activity');
  });

  it('allows recap when user is active and eligible', () => {
    expect(isWeeklyRecapEligible(baseInput())).toBe(true);
  });
});

describe('weekly recap scheduling', () => {
  it('anchors dedupe log date to ISO week Monday in challenge timezone', () => {
    const logDate = getWeeklyRecapLogDate(TZ, SUNDAY);
    expect(logDate.toISOString()).toBe('2026-06-22T00:00:00.000Z');
  });

  it('dedupes per ISO week across timezone edges', () => {
    const keys = getWeeklyRecapWeekKeys(
      'Pacific/Kiritimati',
      new Date('2026-06-27T10:00:00.000Z'),
    );
    expect(keys.weekStartKey).toBe('2026-06-22');
    expect(keys.weekEndKey).toBe('2026-06-28');
  });

  it('opens the Sunday 10:00 window with catch-up', () => {
    expect(
      isWeeklyRecapWindowActionable({
        timezone: TZ,
        recapLogThisWeek: null,
        now: new Date('2026-06-28T10:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isWeeklyRecapWindowActionable({
        timezone: TZ,
        recapLogThisWeek: null,
        now: new Date('2026-06-28T10:12:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isWeeklyRecapWindowActionable({
        timezone: TZ,
        recapLogThisWeek: null,
        now: SATURDAY,
      }),
    ).toBe(false);
  });

  it('retries FAILED sends within the retry window', () => {
    expect(
      isWeeklyRecapSlotDue({
        timezone: TZ,
        recapLogThisWeek: { status: 'FAILED' },
        now: new Date('2026-06-28T10:05:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isWeeklyRecapSlotDue({
        timezone: TZ,
        recapLogThisWeek: { status: 'SENT' },
        now: new Date('2026-06-28T10:05:00.000Z'),
      }),
    ).toBe(false);
  });

  it('exports WEEKLY_RECAP kind constant', () => {
    expect(WEEKLY_RECAP_KIND).toBe('WEEKLY_RECAP');
  });

  it('detects local Sunday', () => {
    expect(isLocalSunday(TZ, SUNDAY)).toBe(true);
    expect(isLocalSunday(TZ, SATURDAY)).toBe(false);
  });

  it('uses challenge timezone for grouped users (reminder convention)', () => {
    expect(
      getWeeklyRecapTimezone({
        timezone: 'Pacific/Kiritimati',
        challengeTimezone: 'UTC',
      }),
    ).toBe('UTC');
    expect(
      isWeeklyRecapSundaySweepDue('UTC', new Date('2026-06-28T10:00:00.000Z')),
    ).toBe(true);
    expect(
      isWeeklyRecapSundaySweepDue(
        'Pacific/Kiritimati',
        new Date('2026-06-28T10:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('caps Sunday send denominator to finalized days only', () => {
    const range = getRollupEligibleRangeForTest(challenge(), TZ, [], SUNDAY);
    expect(range.eligibleDays).toBe(6);
    expect(range.eligibleEndKey).toBe('2026-06-27');
  });

  it('skips Sunday-only live activity when today is not finalized', () => {
    const rollupRange = getRollupEligibleRangeForTest(
      challenge(),
      TZ,
      [],
      SUNDAY,
    );
    expect(
      getWeeklyRecapSkipReason(
        baseInput({
          activityDatesInWeek: ['2026-06-28'],
          eligibleRange: rollupRange,
        }),
      ),
    ).toBe('zero_activity');
  });

  it('opens the Sunday sweep only inside catch-up + retry window', () => {
    expect(isWeeklyRecapSundaySweepDue(TZ, SUNDAY)).toBe(true);
    expect(isWeeklyRecapSundaySweepDue(TZ, SATURDAY)).toBe(false);
    expect(
      isWeeklyRecapSundaySweepDue(TZ, new Date('2026-06-28T11:00:00.000Z')),
    ).toBe(false);
  });
});
