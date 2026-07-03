import {
  COMPANION_MOOD_CATALOG,
  computeRollingCompletionRate,
  deriveCompanionMood,
  getCompanionCopyLine,
  type HeatmapCellState,
} from '@workspace-starter/types';
import { useMemo } from 'react';

export type UseCompanionMoodInput = {
  cells: ReadonlyArray<{ dayNumber: number; state: HeatmapCellState }>;
  currentDay: number;
  todayComplete?: boolean;
  dateKey: string;
};

export function useCompanionMood(input: UseCompanionMoodInput) {
  const { cells, currentDay, todayComplete, dateKey } = input;

  return useMemo(() => {
    const { rate, evaluatedDays, completedDays } = computeRollingCompletionRate(
      {
        cells,
        currentDay,
        todayComplete,
      },
    );
    const mood = deriveCompanionMood(rate, evaluatedDays, currentDay);
    const definition = COMPANION_MOOD_CATALOG[mood];

    return {
      mood,
      rate,
      evaluatedDays,
      completedDays,
      copyLine: getCompanionCopyLine(mood, dateKey, evaluatedDays),
      label: definition.label,
      visualDescription: definition.visualDescription,
    };
  }, [cells, currentDay, todayComplete, dateKey]);
}
