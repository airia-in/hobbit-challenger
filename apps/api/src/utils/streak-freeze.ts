import {
  isFreezeAbsorbed,
  isInterimDayCompleted,
  type DayScoreCompletionInput,
} from './day-completion';
import { getIsoWeekRange } from './day-window';

export const STREAK_FREEZE_UNLOCK_STREAK = 7;
export const STREAK_FREEZE_MAX_HELD = 1;

export type StreakFreezeChallenge = {
  currentStreak: number;
  streakFreezesAvailable: number;
  lastStreakFreezeGrantedAt?: Date | null;
};

export function grantedThisIsoWeek(
  lastGranted: Date | null | undefined,
  date: Date,
  timezone: string,
): boolean {
  if (!lastGranted) {
    return false;
  }
  const { start, end } = getIsoWeekRange(timezone, date);
  const grantedAt = lastGranted.getTime();
  return grantedAt >= start.getTime() && grantedAt <= end.getTime();
}

export function priorDayAllowsFreezeConsume(
  previousDayScore: DayScoreCompletionInput | null | undefined,
): boolean {
  // Missing or not-yet-finalized prior days are treated as a clean slate so a
  // single miss can still consume inventory (operational gaps must not punish).
  if (!previousDayScore || previousDayScore.finalized === false) {
    return true;
  }
  // A prior success or a freeze-absorbed miss counts as "exactly one miss" for
  // the current day. Freeze-absorbed allows another consume when max-held rises;
  // with STREAK_FREEZE_MAX_HELD = 1 weekly grants prevent double-spend today.
  return (
    isInterimDayCompleted(previousDayScore) ||
    isFreezeAbsorbed(previousDayScore)
  );
}

export function canConsumeStreakFreeze(
  challenge: StreakFreezeChallenge,
  previousDayScore: DayScoreCompletionInput | null | undefined,
): boolean {
  return (
    challenge.streakFreezesAvailable > 0 &&
    // User-generous: any positive streak may spend earned inventory, including
    // post-break streak 1 when a cloak was granted before the break.
    challenge.currentStreak > 0 &&
    priorDayAllowsFreezeConsume(previousDayScore)
  );
}

export function canGrantStreakFreeze(
  challenge: StreakFreezeChallenge,
  newStreak: number,
  evaluationDay: Date,
  timezone: string,
): boolean {
  return (
    newStreak === STREAK_FREEZE_UNLOCK_STREAK &&
    challenge.streakFreezesAvailable < STREAK_FREEZE_MAX_HELD &&
    !grantedThisIsoWeek(
      challenge.lastStreakFreezeGrantedAt,
      evaluationDay,
      timezone,
    )
  );
}
