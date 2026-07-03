import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_MAX_OFFSET_MINUTES,
  aggregateFirstLogMinutesByDay,
  buildAdaptiveTimingMap,
  computeAdaptiveWindowStart,
  createdAtToLocalMinutes,
  medianAbsoluteDeviation,
  medianMinutes,
  resolveEffectiveMorningTime,
} from '../src/utils/reminder-timing';

function logRow(
  overrides: Partial<{
    userId: string;
    date: Date;
    createdAt: Date;
    state: string | null;
    tier: string | null;
    value: number | null;
  }> = {},
) {
  return {
    userId: 'u1',
    date: new Date('2026-06-10T00:00:00.000Z'),
    createdAt: new Date('2026-06-10T08:20:00.000Z'),
    state: 'DONE' as string | null,
    tier: null,
    value: null,
    subPoints: null,
    ...overrides,
  };
}

describe('reminder-timing', () => {
  it('computes median of minute samples', () => {
    expect(medianMinutes([500, 520, 510])).toBe(510);
    expect(medianMinutes([500, 520])).toBe(510);
  });

  it('computes median absolute deviation', () => {
    const median = medianMinutes([480, 500, 520, 540, 560]);
    expect(medianAbsoluteDeviation([480, 500, 520, 540, 560], median)).toBe(20);
  });

  it('falls back when history is sparse', () => {
    const result = resolveEffectiveMorningTime({
      baseReminderTime: '08:00',
      reminderAdaptive: true,
      firstLogMinutesByDay: [500, 510, 520, 530],
    });
    expect(result).toBe('08:00');
  });

  it('falls back when variance is high', () => {
    const result = resolveEffectiveMorningTime({
      baseReminderTime: '08:00',
      reminderAdaptive: true,
      firstLogMinutesByDay: [360, 420, 540, 600, 660],
    });
    expect(result).toBe('08:00');
  });

  it('shifts toward median within ±30 minutes', () => {
    const samples = [520, 525, 530, 535, 540];
    const result = resolveEffectiveMorningTime({
      baseReminderTime: '08:00',
      reminderAdaptive: true,
      firstLogMinutesByDay: samples,
    });
    expect(result).toBe('08:30');
  });

  it('clamps shift to +30 when median is much later', () => {
    const samples = [600, 605, 610, 615, 620];
    const result = resolveEffectiveMorningTime({
      baseReminderTime: '08:00',
      reminderAdaptive: true,
      firstLogMinutesByDay: samples,
    });
    expect(result).toBe(
      `${String(8).padStart(2, '0')}:${String(ADAPTIVE_MAX_OFFSET_MINUTES).padStart(2, '0')}`,
    );
  });

  it('respects reminderAdaptive opt-out', () => {
    const result = resolveEffectiveMorningTime({
      baseReminderTime: '08:00',
      reminderAdaptive: false,
      firstLogMinutesByDay: [520, 525, 530, 535, 540],
    });
    expect(result).toBe('08:00');
  });

  it('enforces absolute earliest and latest bounds', () => {
    const early = resolveEffectiveMorningTime({
      baseReminderTime: '06:00',
      reminderAdaptive: true,
      firstLogMinutesByDay: [300, 305, 310, 315, 320],
    });
    expect(early).toBe('05:30');

    const late = resolveEffectiveMorningTime({
      baseReminderTime: '11:00',
      reminderAdaptive: true,
      firstLogMinutesByDay: [720, 725, 730, 735, 740],
    });
    expect(late).toBe('11:30');
  });

  it('aggregates first logged activity per day using min createdAt', () => {
    const day = new Date('2026-06-10T00:00:00.000Z');
    const minutes = aggregateFirstLogMinutesByDay(
      [
        logRow({
          date: day,
          createdAt: new Date('2026-06-10T09:00:00.000Z'),
        }),
        logRow({
          date: day,
          createdAt: new Date('2026-06-10T08:15:00.000Z'),
        }),
        logRow({
          date: day,
          createdAt: new Date('2026-06-10T07:00:00.000Z'),
          state: null,
          tier: null,
          value: null,
        }),
      ],
      'UTC',
    );
    expect(minutes).toEqual([495]);
  });

  it('includes recent activity logs in adaptive window start', () => {
    const now = new Date('2026-06-15T08:25:00.000Z');
    const start = computeAdaptiveWindowStart(now, ['UTC']);
    const logDate = new Date('2026-06-10T00:00:00.000Z');
    expect(logDate.getTime()).toBeGreaterThanOrEqual(start.getTime());
  });

  it('extracts local wall-clock minutes in timezone (DST-safe parts)', () => {
    const instant = new Date('2026-01-15T14:30:00.000Z');
    expect(createdAtToLocalMinutes(instant, 'America/New_York')).toBe(
      9 * 60 + 30,
    );
  });

  it('builds per-user timing map with adaptive and fixed users', () => {
    const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
    const logs = [
      logRow({
        userId: 'adaptive',
        date: day('2026-06-01'),
        createdAt: new Date('2026-06-01T08:25:00.000Z'),
      }),
      logRow({
        userId: 'adaptive',
        date: day('2026-06-02'),
        createdAt: new Date('2026-06-02T08:25:00.000Z'),
      }),
      logRow({
        userId: 'adaptive',
        date: day('2026-06-03'),
        createdAt: new Date('2026-06-03T08:25:00.000Z'),
      }),
      logRow({
        userId: 'adaptive',
        date: day('2026-06-04'),
        createdAt: new Date('2026-06-04T08:25:00.000Z'),
      }),
      logRow({
        userId: 'adaptive',
        date: day('2026-06-05'),
        createdAt: new Date('2026-06-05T08:25:00.000Z'),
      }),
    ];

    const map = buildAdaptiveTimingMap(
      [
        {
          id: 'adaptive',
          reminderTime: '08:00',
          reminderAdaptive: true,
          challengeTimezone: 'UTC',
        },
        {
          id: 'fixed',
          reminderTime: '08:00',
          reminderAdaptive: false,
          challengeTimezone: 'UTC',
        },
      ],
      logs,
    );

    expect(map.get('adaptive')).toBe('08:25');
    expect(map.get('fixed')).toBe('08:00');
  });

  it('computes conservative adaptive window start across timezones', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const start = computeAdaptiveWindowStart(now, ['UTC', 'Asia/Kolkata']);
    expect(start.getTime()).toBeLessThan(now.getTime());
  });
});
