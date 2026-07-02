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
  if (!previousDayScore) {
    return true;
  }
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
