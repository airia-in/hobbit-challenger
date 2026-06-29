import { useState } from 'react';
import { cn } from '../utils/cn';

export type HeatmapCellState =
  | 'completed'
  | 'failed'
  | 'future'
  | 'today'
  | 'not_started';

export type HeatmapCellData = {
  dayNumber: number;
  state: HeatmapCellState;
  dayLabel: string | null;
};

export type HeatmapGridProps = {
  cells: HeatmapCellData[];
  adminMode?: boolean;
  onDayLabelEdit?: (dayNumber: number, labelText: string) => void;
  className?: string;
};

const STATE_COLORS: Record<HeatmapCellState, string> = {
  completed: 'bg-[var(--success)]',
  failed: 'bg-[var(--accent-red)]',
  future: 'bg-[var(--border)]',
  today: 'bg-[var(--gold)] ring-2 ring-[var(--gold)] ring-offset-1 ring-offset-[var(--bg-black)]',
  not_started: 'bg-[var(--surface-raised)]',
};

function CellTooltip({
  cell,
  adminMode,
  onDayLabelEdit,
}: {
  cell: HeatmapCellData;
  adminMode?: boolean;
  onDayLabelEdit?: (dayNumber: number, labelText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [labelText, setLabelText] = useState(cell.dayLabel ?? '');

  if (adminMode && editing) {
    return (
      <form
        className="absolute bottom-full left-1/2 z-20 mb-2 w-48 -translate-x-1/2 rounded border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          onDayLabelEdit?.(cell.dayNumber, labelText);
          setEditing(false);
        }}
      >
        <p className="mb-1 text-xs text-[var(--text-muted)]">Day {cell.dayNumber}</p>
        <input
          autoFocus
          value={labelText}
          onChange={(e) => setLabelText(e.target.value)}
          className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)]"
          placeholder="Label text..."
        />
        <div className="flex gap-1">
          <button
            type="submit"
            className="flex-1 rounded bg-[var(--accent-red)] px-2 py-1 text-xs text-white"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex-1 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] group-hover:block">
      <span className="font-medium">Day {cell.dayNumber}</span>
      <span className="mx-1 text-[var(--text-muted)]">·</span>
      <span className="capitalize text-[var(--text-muted)]">{cell.state.replace('_', ' ')}</span>
      {cell.dayLabel && (
        <>
          <br />
          <span className="text-[var(--gold)]">{cell.dayLabel}</span>
        </>
      )}
      {adminMode && (
        <button
          type="button"
          className="pointer-events-auto mt-1 block text-[var(--accent-red)]"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          Edit label
        </button>
      )}
    </div>
  );
}

export function HeatmapGrid({
  cells,
  adminMode = false,
  onDayLabelEdit,
  className,
}: HeatmapGridProps) {
  return (
    <div
      className={cn('grid grid-cols-15 gap-1', className)}
      style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
    >
      {cells.map((cell) => (
        <div key={cell.dayNumber} className="group relative">
          <CellTooltip
            cell={cell}
            adminMode={adminMode}
            onDayLabelEdit={onDayLabelEdit}
          />
          <div
            title={`Day ${cell.dayNumber}${cell.dayLabel ? `: ${cell.dayLabel}` : ''}`}
            className={cn(
              'aspect-square w-full rounded-sm transition hover:opacity-80',
              STATE_COLORS[cell.state],
            )}
          />
        </div>
      ))}
    </div>
  );
}
