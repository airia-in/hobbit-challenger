import { describe, expect, it } from 'vitest';
import {
  getBuddySummarySubjectSkipReason,
  isBuddySummaryRecipientDormant,
  isBuddySummarySlotDue,
  isPossibleBuddySummarySweepUtcMinute,
} from '../src/utils/buddy-summary-eligibility';
import {
  isWeeklyRecapSlotDue,
  isWeeklyRecapSundaySweepDue,
} from '../src/utils/weekly-recap-eligibility';

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

describe('buddy-summary eligibility matrix', () => {
  it('maps winback_precedence to partner_dormant for subject skip', () => {
    const dormantActivity = new Date('2026-06-20T00:00:00.000Z');
    expect(
      getBuddySummarySubjectSkipReason({
        challenge: challenge(),
        challengeTimezone: TZ,
        lastActivityDate: dormantActivity,
        lastWinbackSentAt: null,
        activityDatesInWeek: ['2026-06-27'],
        now: SUNDAY,
      }),
    ).toBe('partner_dormant');
  });

  it('allows an active partner week through subject skip', () => {
    expect(
      getBuddySummarySubjectSkipReason({
        challenge: challenge(),
        challengeTimezone: TZ,
        lastActivityDate: new Date('2026-06-27T00:00:00.000Z'),
        lastWinbackSentAt: null,
        activityDatesInWeek: ['2026-06-27'],
        now: SUNDAY,
      }),
    ).toBeNull();
  });

  it('treats dormant recipients as winback-owned', () => {
    expect(
      isBuddySummaryRecipientDormant({
        challenge: challenge(),
        challengeTimezone: TZ,
        lastActivityDate: new Date('2026-06-20T00:00:00.000Z'),
        lastWinbackSentAt: null,
        now: SUNDAY,
      }),
    ).toBe(true);
  });

  it('shares the recap Sunday slot gate', () => {
    expect(
      isBuddySummarySlotDue({
        timezone: TZ,
        logThisWeek: null,
        now: SUNDAY,
      }),
    ).toBe(
      isWeeklyRecapSlotDue({
        timezone: TZ,
        recapLogThisWeek: null,
        now: SUNDAY,
      }),
    );
  });

  it('pre-filters cron pair loads outside the broad Sunday UTC window', () => {
    expect(isPossibleBuddySummarySweepUtcMinute(SUNDAY)).toBe(true);
    expect(isPossibleBuddySummarySweepUtcMinute(SATURDAY)).toBe(false);
    expect(
      isPossibleBuddySummarySweepUtcMinute(
        new Date('2026-06-29T03:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isPossibleBuddySummarySweepUtcMinute(
        new Date('2026-06-26T12:00:00.000Z'),
      ),
    ).toBe(false);
    expect(isWeeklyRecapSundaySweepDue(TZ, SUNDAY)).toBe(true);
  });
});
