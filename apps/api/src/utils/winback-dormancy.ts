import {
  deriveChallengeProgress,
  isChallengeCompleted,
} from './challenge-range';
import { formatLocalDateKey, getUserLocalDate } from './day-window';

/** Minimum consecutive local days without any ActivityLog before win-back. */
export const WINBACK_DORMANT_DAYS_MIN = 3;

/** Minimum local days between successful win-back sends (unless user logs in between). */
export const WINBACK_SUPPRESSION_DAYS = 7;

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
    lastActivityDate.getTime() > lastWinbackSentAt.getTime()
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
 * Morning reminder precedence (highest wins; only one per local day):
 * 1. WINBACK — dormant 3+ local days without any ActivityLog
 * 2. RECOVERY — first morning after a streak break (< 3 days dormant)
 * 3. MORNING — default
 *
 * WINBACK is mutually exclusive with all other reminder kinds for the day:
 * when a user is win-back eligible, ReminderService defers entirely to WinbackService.
 */
export function shouldBlockOtherRemindersForWinback(input: {
  winbackEligible: boolean;
  winbackSentToday: boolean;
  winbackPendingToday: boolean;
}): boolean {
  return (
    input.winbackSentToday || input.winbackPendingToday || input.winbackEligible
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
