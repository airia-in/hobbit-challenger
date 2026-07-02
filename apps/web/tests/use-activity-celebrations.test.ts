import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useActivityCelebrations } from '../src/lib/use-activity-celebrations';
import type { GetTodayCache } from '../src/lib/today-optimistic';

function makeToday(
  overrides: Partial<GetTodayCache> & {
    activity?: Partial<GetTodayCache['scoredActivities'][number]>;
  } = {},
): GetTodayCache {
  const { activity, ...rest } = overrides;
  return {
    currentDay: 3,
    date: '2026-07-03',
    dateKey: '2026-07-03',
    isViewingToday: true,
    canNavigateBack: true,
    canNavigateForward: false,
    canEdit: true,
    dayTotals: {
      netXp: 0,
      personalXp: 0,
      xpEarned: 0,
      xpDeducted: 0,
    },
    scoredActivities: [
      {
        id: 'activity-1',
        seedKey: 'WATER',
        title: 'Water',
        emoji: '💧',
        kind: 'CHECKBOX',
        scored: true,
        isPersonal: false,
        deductMultiplier: 2,
        allowsProof: false,
        autoCompleteOnProof: false,
        canAttachProof: false,
        canEdit: true,
        log: null,
        currentStreak: 2,
        ...activity,
      },
    ],
    personalActivities: [],
    ...rest,
  };
}

describe('useActivityCelebrations', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not celebrate already-complete tasks on first paint', () => {
    const today = makeToday({
      activity: {
        log: {
          id: 'log-1',
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 100,
          proofUrl: null,
          aiVerdict: null,
        },
      },
    });

    const { result } = renderHook(() => useActivityCelebrations(today, 4));
    expect(result.current.celebrationLines).toEqual({});
  });

  it('produces a celebration line on PENDING to COMPLETED and auto-clears', () => {
    vi.useFakeTimers();

    const pending = makeToday({ activity: { log: null } });
    const { result, rerender } = renderHook(
      ({ today, streak }: { today: GetTodayCache; streak?: number }) =>
        useActivityCelebrations(today, streak),
      { initialProps: { today: pending, streak: 4 } },
    );

    rerender({ today: pending, streak: 4 });

    const completed = makeToday({
      activity: {
        log: {
          id: 'log-1',
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 100,
          proofUrl: null,
          aiVerdict: null,
        },
      },
    });
    rerender({ today: completed, streak: 4 });

    expect(result.current.celebrationLines['activity-1']).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.celebrationLines['activity-1']).toBeUndefined();
  });
});
