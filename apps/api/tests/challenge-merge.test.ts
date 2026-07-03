import { describe, expect, it } from 'vitest';
import { mergeChallengeOnGroupJoin } from '../src/utils/challenge-range';

describe('mergeChallengeOnGroupJoin', () => {
  const timezone = 'UTC';

  it('preserves the earlier solo start date when joining a later fellowship', () => {
    const soloStart = new Date('2026-06-01T00:00:00.000Z');
    const soloEnd = new Date('2026-06-30T00:00:00.000Z');
    const groupStart = new Date('2026-06-10T00:00:00.000Z');
    const groupEnd = new Date('2026-07-09T00:00:00.000Z');
    const now = new Date('2026-06-15T12:00:00.000Z');

    const merged = mergeChallengeOnGroupJoin(
      {
        startDate: soloStart,
        endDate: soloEnd,
        lengthDays: 30,
        currentDay: 15,
      },
      groupStart,
      groupEnd,
      timezone,
      now,
    );

    expect(merged.startDate.toISOString()).toBe(soloStart.toISOString());
    expect(merged.endDate.toISOString()).toBe(groupEnd.toISOString());
    expect(merged.currentDay).toBe(15);
    expect(merged.lengthDays).toBeGreaterThan(30);
  });

  it('uses the group range when solo started after the fellowship', () => {
    const soloStart = new Date('2026-06-20T00:00:00.000Z');
    const soloEnd = new Date('2026-07-19T00:00:00.000Z');
    const groupStart = new Date('2026-06-10T00:00:00.000Z');
    const groupEnd = new Date('2026-07-09T00:00:00.000Z');
    const now = new Date('2026-06-25T12:00:00.000Z');

    const merged = mergeChallengeOnGroupJoin(
      {
        startDate: soloStart,
        endDate: soloEnd,
        lengthDays: 30,
        currentDay: 15,
      },
      groupStart,
      groupEnd,
      timezone,
      now,
    );

    expect(merged.startDate.toISOString()).toBe(groupStart.toISOString());
    expect(merged.endDate.toISOString()).toBe(soloEnd.toISOString());
  });
});
