import { describe, expect, it } from 'vitest';
import {
  computePerActivityStreak,
  computeWeeklyCompletionRates,
  countDaysInclusive,
  getCompletionDayState,
  getIsoWeekStart,
  shapeActivityCompletion,
  shapeActivitySeries,
  shapeLeaderboardMemberSeries,
  shapeLeaderboardSeries,
  shouldBucketWeekly,
  assertLeaderboardSeriesPrivacy,
  type ActivityLogRow,
} from '../src/utils/stats-aggregation';

function log(
  date: string,
  overrides: Partial<ActivityLogRow> = {},
): ActivityLogRow {
  return {
    date,
    value: null,
    xpAwarded: 0,
    state: null,
    tier: null,
    subPoints: null,
    ...overrides,
  };
}

describe('stats-aggregation', () => {
  describe('countDaysInclusive / shouldBucketWeekly', () => {
    it('counts inclusive days', () => {
      expect(countDaysInclusive('2026-06-01', '2026-06-03')).toBe(3);
      expect(countDaysInclusive('2026-06-03', '2026-06-01')).toBe(0);
    });

    it('buckets weekly beyond threshold', () => {
      expect(shouldBucketWeekly('2026-01-01', '2026-03-01')).toBe(false);
      expect(shouldBucketWeekly('2026-01-01', '2026-06-01')).toBe(true);
    });
  });

  describe('shapeActivitySeries', () => {
    it('returns daily points for short ranges', () => {
      const rows = [
        log('2026-06-01', { value: 2, xpAwarded: 20 }),
        log('2026-06-02', { value: 3, xpAwarded: 30 }),
      ];
      const result = shapeActivitySeries(rows, '2026-06-01', '2026-06-02');
      expect(result).toEqual([
        { date: '2026-06-01', value: 2, xpAwarded: 20 },
        { date: '2026-06-02', value: 3, xpAwarded: 30 },
      ]);
    });

    it('returns empty array for inverted range', () => {
      expect(shapeActivitySeries([], '2026-06-05', '2026-06-01')).toEqual([]);
    });

    it('aggregates into weekly buckets for long ranges', () => {
      const rows: ActivityLogRow[] = [];
      for (let i = 0; i < 100; i += 1) {
        const date = `2026-01-${String((i % 28) + 1).padStart(2, '0')}`;
        rows.push(log(date, { value: 1, xpAwarded: 10 }));
      }
      const result = shapeActivitySeries(rows, '2026-01-01', '2026-04-15');
      expect(result.length).toBeLessThan(rows.length);
      expect(result[0]?.date).toBe(getIsoWeekStart('2026-01-01'));
    });
  });

  describe('shapeActivityCompletion', () => {
    it('computes streak, weekly rates, and day states', () => {
      const rows = [
        log('2026-06-01', { state: 'DONE', xpAwarded: 100 }),
        log('2026-06-02', { state: 'FAILED', xpAwarded: -50 }),
        log('2026-06-03', { state: 'DONE', xpAwarded: 100 }),
      ];
      const result = shapeActivityCompletion(
        rows,
        '2026-06-01',
        '2026-06-04',
        '2026-06-03',
      );

      expect(result.streak).toBe(1);
      expect(result.days).toEqual([
        { date: '2026-06-01', state: 'completed' },
        { date: '2026-06-02', state: 'missed' },
        { date: '2026-06-03', state: 'completed' },
        { date: '2026-06-04', state: 'future' },
      ]);
      expect(result.rateByWeek[0]?.rate).toBe(67);
    });

    it('marks number logs as completed when value > 0', () => {
      expect(
        getCompletionDayState(
          log('2026-06-01', { value: 2 }),
          '2026-06-01',
          '2026-06-02',
        ),
      ).toBe('completed');
    });
  });

  describe('computePerActivityStreak', () => {
    it('counts trailing completed days', () => {
      const days = [
        { date: '2026-06-01', state: 'completed' as const },
        { date: '2026-06-02', state: 'missed' as const },
        { date: '2026-06-03', state: 'completed' as const },
        { date: '2026-06-04', state: 'completed' as const },
      ];
      expect(computePerActivityStreak(days)).toBe(2);
    });
  });

  describe('computeWeeklyCompletionRates', () => {
    it('groups by ISO week', () => {
      const rates = computeWeeklyCompletionRates([
        { date: '2026-06-02', state: 'completed' },
        { date: '2026-06-03', state: 'completed' },
        { date: '2026-06-04', state: 'missed' },
      ]);
      expect(rates).toHaveLength(1);
      expect(rates[0]?.weekStart).toBe(getIsoWeekStart('2026-06-02'));
      expect(rates[0]?.rate).toBe(67);
    });
  });

  describe('shapeLeaderboardSeries', () => {
    const members = [
      {
        id: 'u1',
        name: 'Alice',
        dayScores: [
          { date: '2026-06-01', netXp: 100 },
          { date: '2026-06-02', netXp: 50 },
        ],
      },
      {
        id: 'u2',
        name: 'Bob',
        dayScores: [
          { date: '2026-06-01', netXp: 80 },
          { date: '2026-06-02', netXp: 20 },
        ],
      },
    ];

    it('shapes cumulative XP with caller first', () => {
      const result = shapeLeaderboardSeries(
        members,
        '2026-06-01',
        '2026-06-02',
        'cumulative',
        'u2',
      );
      expect(result.members[0]?.isSelf).toBe(true);
      expect(result.members[0]?.points).toEqual([
        { date: '2026-06-01', xp: 80 },
        { date: '2026-06-02', xp: 100 },
      ]);
    });

    it('shapes daily XP', () => {
      const result = shapeLeaderboardMemberSeries(
        members[0]!.dayScores,
        '2026-06-01',
        '2026-06-02',
        'daily',
      );
      expect(result).toEqual([
        { date: '2026-06-01', xp: 100 },
        { date: '2026-06-02', xp: 50 },
      ]);
    });

    it('never exposes proof-related fields', () => {
      const result = shapeLeaderboardSeries(
        members,
        '2026-06-01',
        '2026-06-02',
        'daily',
        'u1',
      );
      expect(() => assertLeaderboardSeriesPrivacy(result)).not.toThrow();
      const json = JSON.stringify(result);
      expect(json).not.toContain('proofUrl');
      expect(json).not.toContain('aiVerdict');
      expect(Object.keys(result.members[0] ?? {})).toEqual(
        expect.arrayContaining(['id', 'name', 'isSelf', 'points']),
      );
    });
  });
});
