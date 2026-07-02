import {
  deriveChallengeProgress,
  isChallengeCompleted,
} from './challenge-range';
import {
  formatLocalDateKey,
  getLocalMinutesSinceTarget,
  getUserLocalDate,
  isLocalTimeMatch,
  isWithinLocalCatchUpWindow,
} from './day-window';

/** Minimum consecutive local days without any ActivityLog before win-back. */
export const WINBACK_DORMANT_DAYS_MIN = 3;

/** Minimum local days between successful win-back sends (unless user logs in between). */
export const WINBACK_SUPPRESSION_DAYS = 7;

/** Default morning slot when user has no custom reminder time. */
export const WINBACK_DEFAULT_MORNING_TIME = '08:00';

/** Catch-up window after the morning slot for first win-back attempt. */
export const WINBACK_FIRST_SEND_CATCH_UP_MINUTES = 15;

export const WINBACK_FAILED_RETRY_WINDOW_MINUTES = 15;

export const WINBACK_KIND = 'WINBACK';

export const OTHER_DAILY_REMINDER_KINDS = [
  'MORNING',
  'EVENING',
  'RECOVERY',
  'STREAK_AT_RISK',
] as const;

function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

function dateKeyToUtcTime(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return Date.UTC(year, month - 1, day);
}

/** Whole local calendar days from `from` to `to` (exclusive of same-day = 0). */
export function localCalendarDaysBetween(
  from: Date,
  to: Date,
  timezone: string,
): number {
  const fromKey = formatLocalDateKey(from, timezone);
  const toKey = formatLocalDateKey(to, timezone);
  const diffMs = dateKeyToUtcTime(toKey) - dateKeyToUtcTime(fromKey);
  return Math.floor(diffMs / 86_400_000);
}

/**
 * True when there have been at least `minDays` full local days without any
 * ActivityLog since `lastActivityDate` (any log counts, scored or not).
 */
export function isDormantForWinback(
  lastActivityDate: Date | null,
  challengeStartDate: Date,
  timezone: string,
  now = new Date(),
  minDays = WINBACK_DORMANT_DAYS_MIN,
): boolean {
  const today = getUserLocalDate(timezone, now);
  const reference = lastActivityDate ?? challengeStartDate;
  return localCalendarDaysBetween(reference, today, timezone) >= minDays;
}

export type WinbackSuppressionInput = {
  lastWinbackSentAt: Date | null;
  lastActivityDate: Date | null;
  timezone: string;
  now?: Date;
};

/**
 * True when a prior successful win-back still blocks another send.
 * Logging after the last win-back resets the suppression window.
 */
export function isWinbackSuppressed(input: WinbackSuppressionInput): boolean {
  const { lastWinbackSentAt, lastActivityDate, timezone } = input;
  const now = input.now ?? new Date();

  if (!lastWinbackSentAt) {
    return false;
  }

  if (
    lastActivityDate &&
    localCalendarDaysBetween(
      getUserLocalDate(timezone, lastWinbackSentAt),
      lastActivityDate,
      timezone,
    ) >= 0
  ) {
    return false;
  }

  const winbackDay = getUserLocalDate(timezone, lastWinbackSentAt);
  const today = getUserLocalDate(timezone, now);
  return (
    localCalendarDaysBetween(winbackDay, today, timezone) <
    WINBACK_SUPPRESSION_DAYS
  );
}

export type WinbackEligibilityInput = {
  lastActivityDate: Date | null;
  challengeStartDate: Date;
  challengeTimezone: string;
  challenge: {
    startDate: Date;
    endDate: Date | null;
    lengthDays: number;
    currentDay: number;
    isActive: boolean;
    stoppedAt: Date | null;
  };
  lastWinbackSentAt: Date | null;
  now?: Date;
};

export function isChallengeEligibleForWinback(
  challenge: WinbackEligibilityInput['challenge'],
  timezone: string,
  now = new Date(),
): boolean {
  if (isChallengeCompleted(challenge, timezone, now)) {
    return false;
  }

  const progress = deriveChallengeProgress(challenge, timezone, now);
  return (
    challenge.isActive &&
    !challenge.stoppedAt &&
    progress.currentDay >= 1 &&
    progress.currentDay <= progress.lengthDays
  );
}

export function isWinbackEligible(input: WinbackEligibilityInput): boolean {
  const now = input.now ?? new Date();
  const timezone = input.challengeTimezone;

  if (!isChallengeEligibleForWinback(input.challenge, timezone, now)) {
    return false;
  }

  if (
    !isDormantForWinback(
      input.lastActivityDate,
      input.challengeStartDate,
      timezone,
      now,
    )
  ) {
    return false;
  }

  return !isWinbackSuppressed({
    lastWinbackSentAt: input.lastWinbackSentAt,
    lastActivityDate: input.lastActivityDate,
    timezone,
    now,
  });
}

/**
 * True while win-back can still be attempted in the morning slot (exact minute,
 * catch-up, or FAILED retry window). After this closes without SENT, other
 * reminder kinds may take over the rest of the day.
 */
export function isWinbackMorningWindowActionable(input: {
  timezone: string;
  reminderTime: string | null;
  winbackLogToday: { status: string } | null | undefined;
  now?: Date;
  catchUpMinutes?: number;
  retryWindowMinutes?: number;
}): boolean {
  const now = input.now ?? new Date();
  const morningTime = input.reminderTime ?? WINBACK_DEFAULT_MORNING_TIME;
  const catchUpMinutes =
    input.catchUpMinutes ?? WINBACK_FIRST_SEND_CATCH_UP_MINUTES;
  const retryWindowMinutes =
    input.retryWindowMinutes ?? WINBACK_FAILED_RETRY_WINDOW_MINUTES;

  if (isLocalTimeMatch(input.timezone, morningTime, now)) {
    return true;
  }

  if (input.winbackLogToday?.status === 'FAILED') {
    return isWithinWinbackRetryWindow(
      input.timezone,
      morningTime,
      now,
      retryWindowMinutes,
    );
  }

  if (input.winbackLogToday?.status === 'SENT') {
    return false;
  }

  return isWithinLocalCatchUpWindow(
    input.timezone,
    morningTime,
    now,
    catchUpMinutes,
  );
}

function isWithinWinbackRetryWindow(
  timezone: string,
  targetHHMM: string,
  now: Date,
  windowMinutes: number,
): boolean {
  const elapsed = getLocalMinutesSinceTarget(timezone, targetHHMM, now);
  return elapsed !== null && elapsed > 0 && elapsed <= windowMinutes;
}

export type WinbackDeferInput = {
  lastActivityDate: Date | null;
  challengeStartDate: Date;
  challengeTimezone: string;
  challenge: WinbackEligibilityInput['challenge'];
  lastWinbackSentAt: Date | null;
  winbackLogToday: { status: string } | null | undefined;
  reminderTime: string | null;
  now?: Date;
};

/**
 * Used by ReminderService to defer all reminder kinds while win-back owns the
 * actionable morning window or has already SENT today.
 */
export function shouldDeferRemindersForWinback(
  input: WinbackDeferInput,
): boolean {
  const now = input.now ?? new Date();

  if (input.winbackLogToday?.status === 'SENT') {
    return true;
  }

  const morningActionable = isWinbackMorningWindowActionable({
    timezone: input.challengeTimezone,
    reminderTime: input.reminderTime,
    winbackLogToday: input.winbackLogToday,
    now,
  });

  if (!morningActionable) {
    return false;
  }

  return isWinbackEligible({
    lastActivityDate: input.lastActivityDate,
    challengeStartDate: input.challengeStartDate,
    challengeTimezone: input.challengeTimezone,
    challenge: input.challenge,
    lastWinbackSentAt: input.lastWinbackSentAt,
    now,
  });
}

/**
 * Morning reminder precedence (highest wins; only one per local day):
 * 1. WINBACK — dormant 3+ local days without any ActivityLog
 * 2. RECOVERY — first morning after a streak break (< 3 days dormant)
 * 3. MORNING — default
 *
 * WINBACK is mutually exclusive with all other reminder kinds while it owns
 * the actionable morning window or has already SENT today.
 */
export function shouldBlockOtherRemindersForWinback(input: {
  winbackEligible: boolean;
  winbackSentToday: boolean;
  winbackMorningActionable: boolean;
}): boolean {
  return (
    input.winbackSentToday ||
    (input.winbackEligible && input.winbackMorningActionable)
  );
}

export function shouldRetryWinback(
  existing: { status: string } | null | undefined,
): boolean {
  if (!existing) {
    return true;
  }
  return existing.status === 'FAILED';
}
