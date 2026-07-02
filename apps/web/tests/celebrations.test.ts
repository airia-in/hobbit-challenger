import { describe, expect, it } from 'vitest';
import {
  getPerfectDayBanner,
  getTaskCelebrationLine,
  JOURNEY_LABELS,
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

  it('appends streak context when currentStreak is provided', () => {
    const line = getTaskCelebrationLine({
      seedKey: 'DIET',
      title: 'Diet',
      currentStreak: 4,
    });
    expect(line).toMatch(/4 days/);
  });

  it('returns a stable perfect-day banner for a date key', () => {
    const first = getPerfectDayBanner('2026-07-03');
    const second = getPerfectDayBanner('2026-07-03');
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(10);
  });
});
