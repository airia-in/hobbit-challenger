import { describe, expect, it } from 'vitest';
import {
  allScoredActivitiesCompleted,
  anyActivityCompleted,
  isActivityCompleted,
} from '../src/lib/today-completion';
import type { GetTodayCache, TodayActivity } from '../src/lib/today-optimistic';

function makeActivity(
  overrides: Partial<TodayActivity> & Pick<TodayActivity, 'id'>,
): TodayActivity {
  return {
    seedKey: null,
    title: 'Test',
    emoji: '✅',
    kind: 'CHECKBOX',
    scored: true,
    isPersonal: false,
    deductMultiplier: 1,
    allowsProof: false,
    autoCompleteOnProof: false,
    log: null,
    canAttachProof: false,
    canEdit: true,
    ...overrides,
  };
}

function makeToday(
  scored: TodayActivity[],
  personal: TodayActivity[] = [],
): GetTodayCache {
  return {
    currentDay: 1,
    date: '2026-07-03',
    dateKey: '2026-07-03',
    isViewingToday: true,
    canNavigateBack: false,
    canNavigateForward: false,
    canEdit: true,
    dayTotals: {
      netXp: 0,
      personalXp: 0,
      xpEarned: 0,
      xpDeducted: 0,
    },
    scoredActivities: scored,
    personalActivities: personal,
  };
}

describe('today-completion', () => {
  it('detects checkbox completion from DONE log state', () => {
    const activity = makeActivity({
      id: 'a1',
      log: {
        id: 'l1',
        state: 'DONE',
        value: null,
        tier: null,
        subPoints: null,
        xpAwarded: 100,
        proofUrl: null,
        aiVerdict: null,
      },
    });
    expect(isActivityCompleted(activity)).toBe(true);
  });

  it('returns false when scored activities are not all complete', () => {
    const today = makeToday([
      makeActivity({
        id: 'a1',
        log: {
          id: 'l1',
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 100,
          proofUrl: null,
          aiVerdict: null,
        },
      }),
      makeActivity({ id: 'a2', log: null }),
    ]);
    expect(allScoredActivitiesCompleted(today)).toBe(false);
  });

  it('returns true when every scored activity is complete', () => {
    const doneLog = {
      id: 'l1',
      state: 'DONE' as const,
      value: null,
      tier: null,
      subPoints: null,
      xpAwarded: 100,
      proofUrl: null,
      aiVerdict: null,
    };
    const today = makeToday([
      makeActivity({ id: 'a1', log: doneLog }),
      makeActivity({ id: 'a2', log: { ...doneLog, id: 'l2' } }),
    ]);
    expect(allScoredActivitiesCompleted(today)).toBe(true);
  });

  it('returns false when there are no scored activities', () => {
    expect(allScoredActivitiesCompleted(makeToday([]))).toBe(false);
  });

  it('counts personal activities for anyActivityCompleted', () => {
    const today = makeToday(
      [],
      [
        makeActivity({
          id: 'p1',
          isPersonal: true,
          log: {
            id: 'l1',
            state: 'DONE',
            value: null,
            tier: null,
            subPoints: null,
            xpAwarded: 0,
            proofUrl: null,
            aiVerdict: null,
          },
        }),
      ],
    );
    expect(anyActivityCompleted(today)).toBe(true);
  });
});
