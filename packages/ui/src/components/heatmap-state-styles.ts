import type { HeatmapCellState } from './HeatmapGrid';

export const HEATMAP_STATE_CLASSES: Record<HeatmapCellState, string> = {
  completed: 'bg-[var(--success)]',
  failed: 'bg-[var(--surface-raised)]',
  future: 'bg-[var(--border)]',
  today:
    'bg-[var(--gold-fill)] ring-2 ring-[var(--gold)] ring-offset-1 ring-offset-[var(--ring-offset)]',
  not_started: 'bg-[var(--surface-raised)]',
};

export function getHeatmapStateClasses(state: HeatmapCellState): string {
  return HEATMAP_STATE_CLASSES[state];
}
