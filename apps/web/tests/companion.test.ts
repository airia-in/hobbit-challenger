import { describe, expect, it } from 'vitest';
import {
  COMPANION_MOOD_CATALOG,
  COMPANION_MOODS,
  computeRollingCompletionRate,
  deriveCompanionMood,
  getCompanionCopyLine,
  mapHeatmapStateToOutcome,
  type HeatmapCellState,
} from '@workspace-starter/types';

function cell(
  dayNumber: number,
  state: HeatmapCellState,
): { dayNumber: number; state: HeatmapCellState } {
  return { dayNumber, state };
}

function cellsWithWindowStates(
  currentDay: number,
  statesInWindow: HeatmapCellState[],
): { dayNumber: number; state: HeatmapCellState }[] {
  const windowStart = Math.max(1, currentDay - 6);
  const cells: { dayNumber: number; state: HeatmapCellState }[] = [];
  for (let day = 1; day < windowStart; day++) {
    cells.push(cell(day, 'future'));
  }
  statesInWindow.forEach((state, index) => {
    cells.push(cell(windowStart + index, state));
  });
  for (
    let day = windowStart + statesInWindow.length;
    day <= currentDay + 2;
    day++
  ) {
    cells.push(cell(day, 'future'));
  }
  return cells;
}

describe('companion mood derivation', () => {
  it('maps heatmap states to day outcomes', () => {
    expect(mapHeatmapStateToOutcome('completed')).toBe('completed');
    expect(mapHeatmapStateToOutcome('failed')).toBe('missed');
    expect(mapHeatmapStateToOutcome('today', true)).toBe('completed');
    expect(mapHeatmapStateToOutcome('today', false)).toBe('missed');
    expect(mapHeatmapStateToOutcome('not_started')).toBe('excluded');
    expect(mapHeatmapStateToOutcome('future')).toBe('excluded');
  });

  it('computes rolling rate over the last seven challenge days', () => {
    const result = computeRollingCompletionRate({
      cells: cellsWithWindowStates(10, [
        'completed',
        'completed',
        'failed',
        'completed',
        'completed',
        'completed',
        'today',
      ]),
      currentDay: 10,
      todayComplete: true,
    });
    expect(result.completedDays).toBe(6);
    expect(result.evaluatedDays).toBe(7);
    expect(result.rate).toBeCloseTo(6 / 7);
  });

  it('excludes unevaluated past days from the denominator', () => {
    const result = computeRollingCompletionRate({
      cells: cellsWithWindowStates(3, ['not_started', 'completed', 'today']),
      currentDay: 3,
      todayComplete: false,
    });
    expect(result.evaluatedDays).toBe(2);
    expect(result.completedDays).toBe(1);
    expect(result.rate).toBe(0.5);
  });

  it('returns zero evaluated days for a brand-new challenge window', () => {
    const result = computeRollingCompletionRate({
      cells: [cell(1, 'future')],
      currentDay: 0,
      todayComplete: false,
    });
    expect(result.evaluatedDays).toBe(0);
    expect(result.rate).toBe(0);
  });

  it('derives mood band boundaries', () => {
    expect(deriveCompanionMood(0.85, 7)).toBe('thriving');
    expect(deriveCompanionMood(0.849, 100)).toBe('content');
    expect(deriveCompanionMood(0.6, 10)).toBe('content');
    expect(deriveCompanionMood(0.599, 100)).toBe('sleepy');
    expect(deriveCompanionMood(0.35, 20)).toBe('sleepy');
    expect(deriveCompanionMood(0.349, 100)).toBe('rainy');
    expect(deriveCompanionMood(0, 5)).toBe('rainy');
  });

  it('defaults to content when no days are evaluated', () => {
    expect(deriveCompanionMood(0, 0)).toBe('content');
    expect(getCompanionCopyLine('content', '2026-07-03', 0)).toMatch(
      /hobbit-hole is ready/i,
    );
  });

  it('returns stable copy per date key', () => {
    const first = getCompanionCopyLine('thriving', '2026-07-03');
    const second = getCompanionCopyLine('thriving', '2026-07-03');
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(10);
  });

  it('covers every mood in the catalog', () => {
    for (const mood of COMPANION_MOODS) {
      expect(COMPANION_MOOD_CATALOG[mood].copyLines.length).toBeGreaterThan(0);
      expect(getCompanionCopyLine(mood, '2026-07-01').length).toBeGreaterThan(
        10,
      );
    }
  });

  it('keeps rainy copy non-punitive', () => {
    const punitive = /die|fail|shame|neglect/i;
    for (const line of COMPANION_MOOD_CATALOG.rainy.copyLines) {
      expect(line).not.toMatch(punitive);
    }
    expect(getCompanionCopyLine('rainy', '2026-07-03')).not.toMatch(punitive);
  });

  it('maps full completion in window to thriving', () => {
    const { rate, evaluatedDays } = computeRollingCompletionRate({
      cells: cellsWithWindowStates(7, [
        'completed',
        'completed',
        'completed',
        'completed',
        'completed',
        'completed',
        'completed',
      ]),
      currentDay: 7,
    });
    expect(deriveCompanionMood(rate, evaluatedDays)).toBe('thriving');
  });

  it('maps zero percent completion to rainy', () => {
    const { rate, evaluatedDays } = computeRollingCompletionRate({
      cells: cellsWithWindowStates(5, [
        'failed',
        'failed',
        'failed',
        'failed',
        'failed',
      ]),
      currentDay: 5,
    });
    expect(rate).toBe(0);
    expect(deriveCompanionMood(rate, evaluatedDays)).toBe('rainy');
  });
});
