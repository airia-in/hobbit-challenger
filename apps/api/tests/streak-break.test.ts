import { describe, expect, it } from 'vitest';
import { computeStreakBreak } from '../src/utils/streak-break';
import { parseLocalDateKey } from '../src/utils/day-window';

const TZ = 'UTC';

function score(
  dateKey: string,
  allScoredLogged: boolean,
  freezeConsumed = false,
): {
  date: Date;
  breakdown: { allScoredLogged: boolean; freezeConsumed?: boolean };
  finalized: boolean;
} {
  return {
    date: parseLocalDateKey(dateKey, TZ),
    breakdown: {
      allScoredLogged,
      ...(freezeConsumed ? { freezeConsumed: true } : {}),
    },
    finalized: true,
  };
}

describe('computeStreakBreak', () => {
  it('returns no break when there are no finalized days', () => {
    const result = computeStreakBreak(
      [],
      TZ,
      parseLocalDateKey('2026-06-10', TZ),
    );
    expect(result).toEqual({
      occurred: false,
      previousStreak: 0,
      brokeOnDate: null,
      daysSinceBreak: 0,
    });
  });

  it('returns no break when the latest finalized day succeeded', () => {
    const result = computeStreakBreak(
      [score('2026-06-09', true), score('2026-06-08', true)],
      TZ,
      parseLocalDateKey('2026-06-10', TZ),
    );
    expect(result.occurred).toBe(false);
    expect(result.brokeOnDate).toBeNull();
  });

  it('detects a break after a multi-day streak', () => {
    const scores = [
      score('2026-06-10', false),
      score('2026-06-09', true),
      score('2026-06-08', true),
      score('2026-06-07', true),
      score('2026-06-06', true),
      score('2026-06-05', true),
      score('2026-06-04', true),
      score('2026-06-03', true),
      score('2026-06-02', true),
      score('2026-06-01', true),
    ];

    const result = computeStreakBreak(
      scores,
      TZ,
      parseLocalDateKey('2026-06-11', TZ),
    );

    expect(result).toEqual({
      occurred: true,
      previousStreak: 9,
      brokeOnDate: '2026-06-10',
      daysSinceBreak: 1,
    });
  });

  it('does not count a break on day one failure', () => {
    const result = computeStreakBreak(
      [score('2026-06-01', false)],
      TZ,
      parseLocalDateKey('2026-06-02', TZ),
    );
    expect(result.occurred).toBe(false);
    expect(result.previousStreak).toBe(0);
    expect(result.brokeOnDate).toBe('2026-06-01');
  });

  it('computes daysSinceBreak from break date to today', () => {
    const result = computeStreakBreak(
      [score('2026-06-05', false), score('2026-06-04', true)],
      TZ,
      parseLocalDateKey('2026-06-08', TZ),
    );
    expect(result.occurred).toBe(true);
    expect(result.previousStreak).toBe(1);
    expect(result.daysSinceBreak).toBe(3);
  });

  it('keeps recovery active through consecutive failed finalized days', () => {
    const result = computeStreakBreak(
      [
        score('2026-06-03', false),
        score('2026-06-02', false),
        score('2026-06-01', true),
      ],
      TZ,
      parseLocalDateKey('2026-06-04', TZ),
    );
    expect(result.brokeOnDate).toBe('2026-06-03');
    expect(result.previousStreak).toBe(1);
    expect(result.occurred).toBe(true);
    expect(result.daysSinceBreak).toBe(1);
  });

  it('reports streak before the first failure after a long success run', () => {
    const scores = [
      score('2026-06-08', false),
      score('2026-06-07', false),
      score('2026-06-06', false),
      score('2026-06-05', true),
      score('2026-06-04', true),
      score('2026-06-03', true),
      score('2026-06-02', true),
      score('2026-06-01', true),
    ];

    const result = computeStreakBreak(
      scores,
      TZ,
      parseLocalDateKey('2026-06-09', TZ),
    );

    expect(result).toEqual({
      occurred: true,
      previousStreak: 5,
      brokeOnDate: '2026-06-08',
      daysSinceBreak: 1,
    });
  });

  it('detects a break after miss-success-miss pattern', () => {
    const result = computeStreakBreak(
      [
        score('2026-06-03', false),
        score('2026-06-02', true),
        score('2026-06-01', false),
      ],
      TZ,
      parseLocalDateKey('2026-06-04', TZ),
    );

    expect(result).toEqual({
      occurred: true,
      previousStreak: 1,
      brokeOnDate: '2026-06-03',
      daysSinceBreak: 1,
    });
  });

  it('uses challenge-local today for daysSinceBreak', () => {
    const result = computeStreakBreak(
      [score('2026-06-10', false), score('2026-06-09', true)],
      'Asia/Tokyo',
      parseLocalDateKey('2026-06-12', 'Asia/Tokyo'),
    );

    expect(result.daysSinceBreak).toBe(2);
  });

  it('returns no break when latest day failed with freeze consumed', () => {
    const result = computeStreakBreak(
      [score('2026-06-10', false, true), score('2026-06-09', true)],
      TZ,
      parseLocalDateKey('2026-06-11', TZ),
    );

    expect(result.occurred).toBe(false);
    expect(result.brokeOnDate).toBeNull();
  });

  it('treats freeze-absorbed miss between successes as non-breaking', () => {
    const result = computeStreakBreak(
      [
        score('2026-06-10', true),
        score('2026-06-09', false, true),
        score('2026-06-08', true),
      ],
      TZ,
      parseLocalDateKey('2026-06-11', TZ),
    );

    expect(result.occurred).toBe(false);
  });

  it('breaks on consecutive real miss after freeze-absorbed day', () => {
    const result = computeStreakBreak(
      [
        score('2026-06-11', false),
        score('2026-06-10', false, true),
        score('2026-06-09', true),
      ],
      TZ,
      parseLocalDateKey('2026-06-12', TZ),
    );

    expect(result.occurred).toBe(true);
    expect(result.previousStreak).toBe(1);
    expect(result.brokeOnDate).toBe('2026-06-11');
  });
});
