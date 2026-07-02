import { describe, expect, it } from 'vitest';
import {
  applyMutationResult,
  optimisticMarkDone,
  optimisticProofAttached,
  optimisticUndo,
  type GetTodayCache,
} from '../src/lib/today-optimistic';

function createCache(): GetTodayCache {
  return {
    currentDay: 3,
    date: '2026-07-02',
    dateKey: '2026-07-02',
    isViewingToday: true,
    canNavigateBack: true,
    canNavigateForward: false,
    canEdit: true,
    dayTotals: { netXp: 0, personalXp: 0, xpEarned: 0, xpDeducted: 0 },
    scoredActivities: [
      {
        id: 'activity-1',
        seedKey: 'PROGRESS_PHOTO',
        title: 'Progress photo',
        emoji: '📸',
        kind: 'CHECKBOX',
        scored: true,
        isPersonal: false,
        xpComplete: 200,
        xpMiss: -200,
        deductMultiplier: 2,
        allowsProof: true,
        autoCompleteOnProof: true,
        log: null,
        canAttachProof: true,
        canEdit: true,
        currentStreak: 2,
      },
    ],
    personalActivities: [],
  };
}

function firstActivity(cache: GetTodayCache) {
  return cache.scoredActivities[0];
}

describe('today optimistic cache helpers', () => {
  it('clears currentStreak while a mark-done mutation waits for refetch', () => {
    const updated = optimisticMarkDone(createCache(), 'activity-1');

    expect(firstActivity(updated)?.log?.state).toBe('DONE');
    expect(firstActivity(updated)?.currentStreak).toBeUndefined();
  });

  it('clears currentStreak after server log results until getToday refetches', () => {
    const updated = applyMutationResult(createCache(), 'activity-1', {
      log: {
        id: 'log-1',
        state: 'DONE',
        value: null,
        tier: null,
        subPoints: null,
        xpAwarded: 200,
        proofUrl: null,
        aiVerdict: null,
      },
      dayTotals: { netXp: 200, personalXp: 0, xpEarned: 200, xpDeducted: 0 },
    });

    expect(firstActivity(updated)?.currentStreak).toBeUndefined();
  });

  it('clears currentStreak while an undo mutation waits for refetch', () => {
    const updated = optimisticUndo(createCache(), 'activity-1');

    expect(firstActivity(updated)?.log).toBeNull();
    expect(firstActivity(updated)?.currentStreak).toBeUndefined();
  });

  it('preserves currentStreak when attaching proof only changes proof metadata', () => {
    const updated = optimisticProofAttached(
      createCache(),
      'activity-1',
      '/uploads/proof.jpg',
    );

    expect(firstActivity(updated)?.log?.proofUrl).toBe('/uploads/proof.jpg');
    expect(firstActivity(updated)?.currentStreak).toBe(2);
  });
});
