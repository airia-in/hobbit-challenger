import { describe, expect, it } from 'vitest';
import { getMemberStatus } from '../src/utils/member-status';

function makeChallenge(
  overrides: Partial<{
    isActive: boolean;
    currentDay: number;
    lengthDays: number;
  }> = {},
) {
  return {
    id: 'challenge-1',
    userId: 'user-1',
    groupId: null,
    startDate: new Date(),
    endDate: null,
    lengthDays: 30,
    currentDay: 1,
    isActive: true,
    totalXp: 0,
    currentStreak: 0,
    longestStreak: 0,
    ...overrides,
  };
}

describe('getMemberStatus', () => {
  it('returns ACTIVE for an in-progress challenge', () => {
    expect(
      getMemberStatus(makeChallenge({ currentDay: 5, lengthDays: 30 })),
    ).toBe('ACTIVE');
  });

  it('returns COMPLETED when currentDay exceeds lengthDays', () => {
    expect(
      getMemberStatus(makeChallenge({ currentDay: 31, lengthDays: 30 })),
    ).toBe('COMPLETED');
  });

  it('returns COMPLETED when challenge is inactive', () => {
    expect(getMemberStatus(makeChallenge({ isActive: false }))).toBe(
      'COMPLETED',
    );
  });

  it('returns COMPLETED for null challenge', () => {
    expect(getMemberStatus(null)).toBe('COMPLETED');
  });
});
