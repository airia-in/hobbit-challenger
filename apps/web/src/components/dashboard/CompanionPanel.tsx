import { CompanionSvg } from '@workspace-starter/ui';
import type { HeatmapCellState } from '@workspace-starter/types';
import { useCompanionMood } from '../../lib/use-companion-mood';

export type CompanionPanelProps = {
  cells: ReadonlyArray<{ dayNumber: number; state: HeatmapCellState }>;
  currentDay: number;
  todayComplete?: boolean;
  dateKey: string;
};

export function CompanionPanel({
  cells,
  currentDay,
  todayComplete,
  dateKey,
}: CompanionPanelProps) {
  const companion = useCompanionMood({
    cells,
    currentDay,
    todayComplete,
    dateKey,
  });

  return (
    <section data-testid="companion-panel">
      <h2
        className="mb-4 text-lg uppercase tracking-wider text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Your garden
      </h2>
      <div
        className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
        data-mood={companion.mood}
      >
        <CompanionSvg
          mood={companion.mood}
          ariaLabel={companion.visualDescription}
        />
        <div className="min-w-0">
          <p
            className="text-xs uppercase tracking-wider text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {companion.label}
          </p>
          <p className="text-sm text-[var(--text-primary)]">
            {companion.copyLine}
          </p>
        </div>
      </div>
    </section>
  );
}
