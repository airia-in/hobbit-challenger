import { cn } from '../utils/cn';

export type CompletionHeatmapDayState =
  | 'completed'
  | 'missed'
  | 'unlogged'
  | 'future';

export type CompletionHeatmapDay = {
  date: string;
  state: CompletionHeatmapDayState;
};

export type CompletionHeatmapProps = {
  days: CompletionHeatmapDay[];
  className?: string;
};

const STATE_COLORS: Record<CompletionHeatmapDayState, string> = {
  completed: 'var(--success)',
  missed: 'var(--accent-red)',
  unlogged: 'var(--surface-raised)',
  future: 'var(--border)',
};

const LEGEND: { state: CompletionHeatmapDayState; label: string }[] = [
  { state: 'completed', label: 'Completed' },
  { state: 'missed', label: 'Missed' },
  { state: 'unlogged', label: 'No log' },
  { state: 'future', label: 'Upcoming' },
];

const CELL = 12;
const GAP = 2;

export function CompletionHeatmap({ days, className }: CompletionHeatmapProps) {
  if (days.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-6 text-center text-sm text-[var(--text-muted)]',
          className,
        )}
      >
        Not enough data yet
      </div>
    );
  }

  const cols = 7;
  const rows = Math.ceil(days.length / cols);
  const svgWidth = cols * (CELL + GAP) - GAP;
  const svgHeight = rows * (CELL + GAP) - GAP;

  return (
    <div className={cn('space-y-3', className)}>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="h-auto w-full max-w-md"
        role="img"
        aria-label="Completion calendar heatmap"
      >
        {days.map((day, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const x = col * (CELL + GAP);
          const y = row * (CELL + GAP);
          return (
            <rect
              key={day.date}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={2}
              fill={STATE_COLORS[day.state]}
            >
              <title>{`${day.date}: ${day.state}`}</title>
            </rect>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-3">
        {LEGEND.map((item) => (
          <div
            key={item.state}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
          >
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: STATE_COLORS[item.state] }}
            />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
