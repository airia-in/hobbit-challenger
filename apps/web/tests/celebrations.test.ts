import { describe, expect, it } from 'vitest';
import {
  getPerfectDayBanner,
  getStreakRecoveryCta,
  getTaskCelebrationLine,
  JOURNEY_LABELS,
  pickEasiestUnloggedScoredHabit,
} from '../src/lib/celebrations';

describe('celebrations', () => {
  it('exposes journey language labels', () => {
    expect(JOURNEY_LABELS.pathXpToday).toBe('Path XP today');
    expect(JOURNEY_LABELS.fellowTravelers).toBe('Fellow travelers');
    expect(JOURNEY_LABELS.streakPlural).toBe('days on the trail');
  });

  it('returns habit-specific copy for built-in seed keys', () => {
    const line = getTaskCelebrationLine({
      seedKey: 'WATER',
      title: 'Water',
      dateKey: '2026-07-03',
    });
    expect(line.toLowerCase()).toMatch(/water|hydration|thirst/);
  });

  it('falls back to generic copy for unknown habits', () => {
    const line = getTaskCelebrationLine({
      seedKey: 'CUSTOM_HABIT',
      title: 'Stretch',
    });
    expect(line.length).toBeGreaterThan(10);
  });

  it('uses streak suffix pluralization for multi-day streaks', () => {
    const line = getTaskCelebrationLine({
      seedKey: 'DIET',
      title: 'Diet',
      currentStreak: 3,
      dateKey: '2026-07-03',
    });
    expect(line).toMatch(/3 days/);
    expect(line).not.toMatch(/3-day day/);
  });

  it('builds recovery CTA copy from the easiest habit title', () => {
    expect(getStreakRecoveryCta('Water')).toBe('Log Water — easy win');
  });

  it('ranks checkbox habits as easiest', () => {
    const easiest = pickEasiestUnloggedScoredHabit(
      [
        { id: '1', title: 'Steps', kind: 'NUMBER' },
        { id: '2', title: 'Water', kind: 'CHECKBOX' },
      ],
      () => false,
    );
    expect(easiest?.title).toBe('Water');
  });

  it('returns a stable perfect-day banner for a date key', () => {
    const first = getPerfectDayBanner('2026-07-03');
    const second = getPerfectDayBanner('2026-07-03');
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(10);
  });
});
