import { describe, expect, it } from 'vitest';
import {
  canConsumeStreakFreeze,
  canGrantStreakFreeze,
  grantedThisIsoWeek,
  priorDayAllowsFreezeConsume,
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

  it('keeps ISO-week dedupe stable across US DST transition weeks', () => {
    const springMonday = parseLocalDateKey('2026-03-09', TZ);
    const springGrantedAt = new Date(springMonday.getTime());
    const springWednesday = parseLocalDateKey('2026-03-11', TZ);
    expect(grantedThisIsoWeek(springGrantedAt, springWednesday, TZ)).toBe(true);

    const fallMonday = parseLocalDateKey('2026-11-02', TZ);
    const fallGrantedAt = new Date(fallMonday.getTime());
    const fallThursday = parseLocalDateKey('2026-11-05', TZ);
    expect(grantedThisIsoWeek(fallGrantedAt, fallThursday, TZ)).toBe(true);

    const priorSpringWeek = parseLocalDateKey('2026-03-02', TZ);
    expect(
      grantedThisIsoWeek(new Date(priorSpringWeek.getTime()), springMonday, TZ),
    ).toBe(false);
  });

  it('treats unfinalized prior day like missing for consume eligibility', () => {
    expect(
      priorDayAllowsFreezeConsume({
        finalized: false,
        breakdown: { allScoredLogged: false },
      }),
    ).toBe(true);
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

    expect(
      canConsumeStreakFreeze(
        {
          currentStreak: 1,
          streakFreezesAvailable: 1,
          lastStreakFreezeGrantedAt: null,
        },
        priorSuccess,
      ),
    ).toBe(true);
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
