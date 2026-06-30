import { describe, expect, it } from 'vitest';
import {
  computeDayLoggingStatus,
  computeCurrentStreak,
  isActivityLogLogged,
  isInterimDayCompleted,
  isInterimDayFailed,
} from '../src/utils/day-completion';

const activityIds = ['a1', 'a2', 'a3'];

describe('isActivityLogLogged', () => {
  it('counts FAILED state as logged', () => {
    expect(
      isActivityLogLogged({
        state: 'FAILED',
        tier: null,
        value: null,
        subPoints: null,
      }),
    ).toBe(true);
  });

  it('counts zero value as logged', () => {
    expect(
      isActivityLogLogged({
        state: null,
        tier: null,
        value: 0,
        subPoints: null,
      }),
    ).toBe(true);
  });

  it('counts subPoints payload as logged', () => {
    expect(
      isActivityLogLogged({
        state: null,
        tier: null,
        value: null,
        subPoints: { HEALTHY: 'FAILED' },
      }),
    ).toBe(true);
  });

  it('does not count UNLOGGED-only rows', () => {
    expect(
      isActivityLogLogged({
        state: 'UNLOGGED',
        tier: null,
        value: null,
        subPoints: null,
      }),
    ).toBe(false);
  });
});

describe('computeDayLoggingStatus', () => {
  it('requires every scored activity to be logged', () => {
    const status = computeDayLoggingStatus(activityIds, [
      {
        activityId: 'a1',
        state: 'DONE',
        tier: null,
        value: null,
        subPoints: null,
      },
    ]);

    expect(status.expectedCount).toBe(3);
    expect(status.loggedActivityIds).toEqual(['a1']);
    expect(status.allScoredLogged).toBe(false);
  });

  it('returns allScoredLogged when every scored activity has a log', () => {
    const status = computeDayLoggingStatus(activityIds, [
      {
        activityId: 'a1',
        state: 'DONE',
        tier: null,
        value: null,
        subPoints: null,
      },
      {
        activityId: 'a2',
        state: 'FAILED',
        tier: null,
        value: null,
        subPoints: null,
      },
      {
        activityId: 'a3',
        state: null,
        tier: null,
        value: null,
        subPoints: { KEY: 'DONE' },
      },
    ]);

    expect(status.allScoredLogged).toBe(true);
  });
});

describe('isInterimDayCompleted', () => {
  it('reads allScoredLogged from finalized day breakdown', () => {
    expect(
      isInterimDayCompleted({
        finalized: true,
        breakdown: { allScoredLogged: true },
      }),
    ).toBe(true);
    expect(
      isInterimDayFailed({
        finalized: true,
        breakdown: { allScoredLogged: false },
      }),
    ).toBe(true);
  });
});

describe('computeCurrentStreak', () => {
  it('increments streak when all scored activities are logged today', () => {
    const logs = [
      {
        activityId: 'a1',
        state: 'DONE',
        tier: null,
        value: null,
        subPoints: null,
      },
      {
        activityId: 'a2',
        state: 'DONE',
        tier: null,
        value: null,
        subPoints: null,
      },
    ];

    expect(computeCurrentStreak(2, logs, ['a1', 'a2'])).toBe(3);
  });

  it('preserves streak when today is incomplete', () => {
    expect(
      computeCurrentStreak(
        2,
        [
          {
            activityId: 'a1',
            state: 'DONE',
            tier: null,
            value: null,
            subPoints: null,
          },
        ],
        ['a1', 'a2'],
      ),
    ).toBe(2);
  });
});
