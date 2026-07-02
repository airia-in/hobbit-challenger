import { describe, expect, it } from 'vitest';
import {
  computeWeeklyRecapRollup,
  isoWeekStartKey,
} from '../src/utils/weekly-recap-rollup';

const TZ = 'UTC';
const SUNDAY = new Date('2026-06-28T10:00:00.000Z');

function challenge() {
  return {
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-30T00:00:00.000Z'),
    lengthDays: 30,
    currentDay: 20,
    isActive: true,
    stoppedAt: null,
  };
}

describe('weekly recap rollup', () => {
  it('computes week metrics from batched day scores and activity logs', () => {
    const rollup = computeWeeklyRecapRollup({
      challenge: challenge(),
      timezone: TZ,
      now: SUNDAY,
      activityNames: new Map([['a1', 'Morning walk']]),
      dayScores: [
        {
          date: new Date('2026-06-23T00:00:00.000Z'),
          netXp: 50,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
        {
          date: new Date('2026-06-24T00:00:00.000Z'),
          netXp: 40,
          finalized: true,
          breakdown: { allScoredLogged: false },
        },
        {
          date: new Date('2026-06-25T00:00:00.000Z'),
          netXp: 30,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
        {
          date: new Date('2026-06-22T00:00:00.000Z'),
          netXp: 100,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
      ],
      activityLogs: [
        {
          activityId: 'a1',
          date: new Date('2026-06-23T00:00:00.000Z'),
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
        {
          activityId: 'a1',
          date: new Date('2026-06-24T00:00:00.000Z'),
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
        {
          activityId: 'a2',
          date: new Date('2026-06-25T00:00:00.000Z'),
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
      ],
    });

    expect(rollup.weekStartKey).toBe('2026-06-22');
    expect(rollup.weekEndKey).toBe('2026-06-28');
    expect(rollup.eligibleDays).toBe(6);
    expect(rollup.daysShowedUp).toBe(3);
    expect(rollup.perfectDays).toBe(3);
    expect(rollup.totalHabitsHit).toBe(3);
    expect(rollup.weekXp).toBe(220);
    expect(rollup.bestHabitName).toBe('Morning walk');
    expect(rollup.bestHabitHits).toBe(2);
    expect(rollup.identityReflectionLine).toContain('showed up');
    expect(rollup.nextWeekNudgeLine).toContain('Morning walk');
  });

  it('tracks streak trajectory across the week boundary', () => {
    const rollup = computeWeeklyRecapRollup({
      challenge: challenge(),
      timezone: TZ,
      now: SUNDAY,
      activityNames: new Map(),
      dayScores: [
        {
          date: new Date('2026-06-20T00:00:00.000Z'),
          netXp: 10,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
        {
          date: new Date('2026-06-21T00:00:00.000Z'),
          netXp: 10,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
        {
          date: new Date('2026-06-23T00:00:00.000Z'),
          netXp: 10,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
        {
          date: new Date('2026-06-24T00:00:00.000Z'),
          netXp: 10,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
      ],
      activityLogs: [
        {
          activityId: 'a1',
          date: new Date('2026-06-23T00:00:00.000Z'),
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
      ],
    });

    expect(rollup.streakStart).toBe(2);
    expect(rollup.streakEnd).toBe(4);
  });

  it('anchors ISO week start consistently', () => {
    expect(isoWeekStartKey('2026-06-28')).toBe('2026-06-22');
    expect(isoWeekStartKey('2026-06-22')).toBe('2026-06-22');
  });

  it('excludes unfinalized Sunday from rollup on Sunday send', () => {
    const rollup = computeWeeklyRecapRollup({
      challenge: challenge(),
      timezone: TZ,
      now: SUNDAY,
      activityNames: new Map([['a1', 'Morning walk']]),
      dayScores: [
        {
          date: new Date('2026-06-27T00:00:00.000Z'),
          netXp: 50,
          finalized: true,
          breakdown: { allScoredLogged: true },
        },
      ],
      activityLogs: [
        {
          activityId: 'a1',
          date: new Date('2026-06-27T00:00:00.000Z'),
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
        {
          activityId: 'a1',
          date: new Date('2026-06-28T10:00:00.000Z'),
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
      ],
    });

    expect(rollup.eligibleDays).toBe(6);
    expect(rollup.daysShowedUp).toBe(1);
    expect(rollup.totalHabitsHit).toBe(1);
    expect(rollup.weekXp).toBe(50);
    expect(rollup.perfectDays).toBe(1);
  });

  it('pluralizes identity copy for a single eligible day', () => {
    const rollup = computeWeeklyRecapRollup({
      challenge: {
        ...challenge(),
        startDate: new Date('2026-06-27T00:00:00.000Z'),
      },
      timezone: TZ,
      now: new Date('2026-06-27T10:00:00.000Z'),
      activityNames: new Map(),
      dayScores: [
        {
          date: new Date('2026-06-27T00:00:00.000Z'),
          netXp: 10,
          finalized: true,
          breakdown: { allScoredLogged: false },
        },
      ],
      activityLogs: [
        {
          activityId: 'a1',
          date: new Date('2026-06-27T00:00:00.000Z'),
          state: 'DONE',
          tier: null,
          value: null,
          subPoints: null,
        },
      ],
    });

    expect(rollup.eligibleDays).toBe(1);
    expect(rollup.identityReflectionLine).toContain('1 of 1 day');
    expect(rollup.identityReflectionLine).not.toContain('1 of 1 days');
  });
});
