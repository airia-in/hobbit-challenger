import { fallbackScheduledEnd } from './challenge-range';
import {
  formatLocalDateKey,
  getIsoWeekRange,
  getLocalMinutesSinceTarget,
  isLocalTimeMatch,
  isWithinLocalCatchUpWindow,
  parseLocalDateKey,
} from './day-window';
import {
  countDaysInclusive,
  getIsoWeekStart,
  iterDateKeys,
} from './stats-aggregation';
import { isDormantForWinback, isWinbackEligible } from './winback-dormancy';

export const WEEKLY_RECAP_KIND = 'WEEKLY_RECAP';
export const WEEKLY_RECAP_TIME = '10:00';
export const WEEKLY_RECAP_CATCH_UP_MINUTES = 15;
export const WEEKLY_RECAP_RETRY_MINUTES = 15;
export const WEEKLY_RECAP_MIN_ELIGIBLE_DAYS = 3;

type ChallengeLike = {
  startDate: Date;
  endDate: Date | null;
  lengthDays: number;
  currentDay: number;
  isActive: boolean;
  stoppedAt: Date | null;
};

function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

/** True when the user's local calendar day is Sunday. */
export function isLocalSunday(timezone: string, now = new Date()): boolean {
  const dateKey = formatLocalDateKey(now, timezone);
  const { year, month, day } = parseDateKey(dateKey);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return utcDate.getUTCDay() === 0;
}

/** ReminderLog date anchor: local midnight on the ISO week's Monday. */
export function getWeeklyRecapLogDate(
  timezone: string,
  now = new Date(),
): Date {
  const dateKey = formatLocalDateKey(now, timezone);
  const weekStartKey = getIsoWeekStart(dateKey);
  return parseLocalDateKey(weekStartKey, timezone);
}

export function getWeeklyRecapWeekKeys(
  timezone: string,
  now = new Date(),
): { weekStartKey: string; weekEndKey: string } {
  const { start, end } = getIsoWeekRange(timezone, now);
  return {
    weekStartKey: formatLocalDateKey(start, timezone),
    weekEndKey: formatLocalDateKey(end, timezone),
  };
}

export type WeeklyRecapEligibleRange = {
  weekStartKey: string;
  weekEndKey: string;
  eligibleStartKey: string;
  eligibleEndKey: string;
  eligibleDays: number;
};

export function computeWeeklyRecapEligibleRange(
  challenge: ChallengeLike,
  timezone: string,
  now = new Date(),
): WeeklyRecapEligibleRange {
  const { weekStartKey, weekEndKey } = getWeeklyRecapWeekKeys(timezone, now);
  const todayKey = formatLocalDateKey(now, timezone);
  const challengeStartKey = formatLocalDateKey(challenge.startDate, timezone);
  const challengeEndKey = formatLocalDateKey(
    fallbackScheduledEnd(challenge, timezone),
    timezone,
  );

  const eligibleStartKey =
    weekStartKey > challengeStartKey ? weekStartKey : challengeStartKey;
  const cappedWeekEnd = weekEndKey < todayKey ? weekEndKey : todayKey;
  const eligibleEndKey =
    cappedWeekEnd < challengeEndKey ? cappedWeekEnd : challengeEndKey;

  const eligibleDays =
    eligibleEndKey >= eligibleStartKey
      ? countDaysInclusive(eligibleStartKey, eligibleEndKey)
      : 0;

  return {
    weekStartKey,
    weekEndKey,
    eligibleStartKey,
    eligibleEndKey,
    eligibleDays,
  };
}

export type WeeklyRecapEligibilityInput = {
  challenge: ChallengeLike | null;
  challengeTimezone: string;
  lastActivityDate: Date | null;
  lastWinbackSentAt: Date | null;
  activityDatesInWeek: string[];
  weeklyRecapOptIn: boolean;
  whatsappOptIn: boolean;
  hasPhone: boolean;
  now?: Date;
};

export type WeeklyRecapSkipReason =
  | 'opt_out'
  | 'no_phone'
  | 'no_whatsapp'
  | 'no_challenge'
  | 'not_sunday'
  | 'challenge_ended_before_week'
  | 'insufficient_eligible_days'
  | 'zero_activity'
  | 'winback_precedence';

/**
 * Weekly recap eligibility matrix (#136):
 *
 * | Condition                         | Recap |
 * |-----------------------------------|-------|
 * | weeklyRecapOptIn + phone + WA on  | req   |
 * | Local Sunday ~10:00 window        | req   |
 * | Active challenge in scope         | req   |
 * | Challenge ended before ISO week   | skip  |
 * | Mid-week join: <3 eligible days   | skip  |
 * | Zero activity in eligible range   | skip  |
 * | Winback-eligible (dormant)        | skip  |
 *
 * Coexists with MORNING/EVENING/etc. on the same Sunday; does not compete
 * with WINBACK — dormant users receive win-back, not a hollow recap.
 */
export function getWeeklyRecapSkipReason(
  input: WeeklyRecapEligibilityInput,
): WeeklyRecapSkipReason | null {
  if (!input.hasPhone) return 'no_phone';
  if (!input.whatsappOptIn) return 'no_whatsapp';
  if (!input.weeklyRecapOptIn) return 'opt_out';

  const now = input.now ?? new Date();
  const timezone = input.challengeTimezone;

  if (!isLocalSunday(timezone, now)) {
    return 'not_sunday';
  }

  if (!input.challenge) {
    return 'no_challenge';
  }

  const { weekStartKey } = getWeeklyRecapWeekKeys(timezone, now);
  const challengeEndKey = formatLocalDateKey(
    fallbackScheduledEnd(input.challenge, timezone),
    timezone,
  );
  if (challengeEndKey < weekStartKey) {
    return 'challenge_ended_before_week';
  }

  const range = computeWeeklyRecapEligibleRange(input.challenge, timezone, now);
  if (range.eligibleDays < WEEKLY_RECAP_MIN_ELIGIBLE_DAYS) {
    return 'insufficient_eligible_days';
  }

  const eligibleKeys = iterDateKeys(
    range.eligibleStartKey,
    range.eligibleEndKey,
  );
  const activityInRange = input.activityDatesInWeek.some((dateKey) =>
    eligibleKeys.includes(dateKey),
  );
  if (!activityInRange) {
    return 'zero_activity';
  }

  if (
    isWinbackEligible({
      lastActivityDate: input.lastActivityDate,
      challengeStartDate: input.challenge.startDate,
      challengeTimezone: timezone,
      challenge: input.challenge,
      lastWinbackSentAt: input.lastWinbackSentAt,
      now,
    })
  ) {
    return 'winback_precedence';
  }

  return null;
}

export function isWeeklyRecapEligible(
  input: WeeklyRecapEligibilityInput,
): boolean {
  return getWeeklyRecapSkipReason(input) === null;
}

export function shouldRetryWeeklyRecap(
  existing: { status: string } | null | undefined,
): boolean {
  if (!existing) {
    return true;
  }
  return existing.status === 'FAILED';
}

function isWithinWeeklyRecapRetryWindow(
  timezone: string,
  now: Date,
  windowMinutes: number,
): boolean {
  const elapsed = getLocalMinutesSinceTarget(timezone, WEEKLY_RECAP_TIME, now);
  return elapsed !== null && elapsed > 0 && elapsed <= windowMinutes;
}

/**
 * True while the Sunday ~10:00 slot is actionable (exact minute, catch-up,
 * or FAILED retry). Non-Sundays always return false.
 */
export function isWeeklyRecapWindowActionable(input: {
  timezone: string;
  recapLogThisWeek: { status: string } | null | undefined;
  now?: Date;
  catchUpMinutes?: number;
  retryWindowMinutes?: number;
}): boolean {
  const now = input.now ?? new Date();
  const timezone = input.timezone;

  if (!isLocalSunday(timezone, now)) {
    return false;
  }

  const catchUpMinutes = input.catchUpMinutes ?? WEEKLY_RECAP_CATCH_UP_MINUTES;
  const retryWindowMinutes =
    input.retryWindowMinutes ?? WEEKLY_RECAP_RETRY_MINUTES;

  if (isLocalTimeMatch(timezone, WEEKLY_RECAP_TIME, now)) {
    return true;
  }

  if (input.recapLogThisWeek?.status === 'FAILED') {
    return isWithinWeeklyRecapRetryWindow(timezone, now, retryWindowMinutes);
  }

  if (input.recapLogThisWeek?.status === 'SENT') {
    return false;
  }

  return isWithinLocalCatchUpWindow(
    timezone,
    WEEKLY_RECAP_TIME,
    now,
    catchUpMinutes,
  );
}

export function isWeeklyRecapSlotDue(input: {
  timezone: string;
  recapLogThisWeek: { status: string } | null | undefined;
  now?: Date;
}): boolean {
  if (
    input.recapLogThisWeek?.status === 'SENT' ||
    input.recapLogThisWeek?.status === 'SKIPPED_OPTOUT'
  ) {
    return false;
  }

  if (!shouldRetryWeeklyRecap(input.recapLogThisWeek)) {
    return false;
  }

  return isWeeklyRecapWindowActionable({
    timezone: input.timezone,
    recapLogThisWeek: input.recapLogThisWeek,
    now: input.now,
  });
}

/** Exported for tests — dormant check without full winback eligibility. */
export { isDormantForWinback };
