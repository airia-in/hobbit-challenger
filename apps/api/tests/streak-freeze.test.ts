import { describe, expect, it } from 'vitest';
import {
  canConsumeStreakFreeze,
  canGrantStreakFreeze,
  grantedThisIsoWeek,
} from '../src/utils/streak-freeze';
import { parseLocalDateKey } from '../src/utils/day-window';

const TZ = 'America/New_York';

describe('streak-freeze helpers', () => {
  it('detects grant within the same ISO week', () => {
    const monday = parseLocalDateKey('2026-06-15', TZ);
    const wednesday = parseLocalDateKey('2026-06-17', TZ);
    expect(grantedThisIsoWeek(monday, wednesday, TZ)).toBe(true);
  });

  it('detects no grant when last grant was prior ISO week', () => {
    const lastWeek = parseLocalDateKey('2026-06-14', TZ);
    const thisWeek = parseLocalDateKey('2026-06-16', TZ);
    expect(grantedThisIsoWeek(lastWeek, thisWeek, TZ)).toBe(false);
  });

  it('allows consume only for exactly-one-miss with inventory and streak', () => {
    const priorSuccess = {
      finalized: true,
      breakdown: { allScoredLogged: true },
    };
    const priorFailed = {
      finalized: true,
      breakdown: { allScoredLogged: false },
    };

    expect(
      canConsumeStreakFreeze(
        {
          currentStreak: 5,
          streakFreezesAvailable: 1,
          lastStreakFreezeGrantedAt: null,
        },
        priorSuccess,
      ),
    ).toBe(true);

    expect(
      canConsumeStreakFreeze(
        {
          currentStreak: 5,
          streakFreezesAvailable: 1,
          lastStreakFreezeGrantedAt: null,
        },
        priorFailed,
      ),
    ).toBe(false);

    expect(
      canConsumeStreakFreeze(
        {
          currentStreak: 0,
          streakFreezesAvailable: 1,
          lastStreakFreezeGrantedAt: null,
        },
        priorSuccess,
      ),
    ).toBe(false);
  });

  it('grants only at streak 7+ with empty inventory and weekly slot', () => {
    const day = parseLocalDateKey('2026-06-15', TZ);
    const challenge = {
      currentStreak: 6,
      streakFreezesAvailable: 0,
      lastStreakFreezeGrantedAt: null,
    };

    expect(canGrantStreakFreeze(challenge, 7, day, TZ)).toBe(true);
    expect(canGrantStreakFreeze(challenge, 8, day, TZ)).toBe(false);
    expect(
      canGrantStreakFreeze(
        { ...challenge, streakFreezesAvailable: 1 },
        7,
        day,
        TZ,
      ),
    ).toBe(false);
    expect(
      canGrantStreakFreeze(
        { ...challenge, lastStreakFreezeGrantedAt: day },
        7,
        day,
        TZ,
      ),
    ).toBe(false);
  });
});
