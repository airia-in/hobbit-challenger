import { cn } from '../utils/cn';

export type StatsRowProps = {
  currentStreak: number;
  longestStreak: number;
  totalDaysCompleted: number;
  successRate: number;
  timesRestarted: number;
  className?: string;
  itemClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
};

const STAT_ITEMS = [
  { key: 'currentStreak', label: 'Current Streak' },
  { key: 'longestStreak', label: 'Longest Streak' },
  { key: 'totalDaysCompleted', label: 'Days Completed' },
  { key: 'successRate', label: 'Success Rate' },
  { key: 'timesRestarted', label: 'Times Restarted' },
] as const;

export function StatsRow({
  currentStreak,
  longestStreak,
  totalDaysCompleted,
  successRate,
  timesRestarted,
  className,
  itemClassName,
  labelClassName,
  valueClassName,
}: StatsRowProps) {
  const values: Record<(typeof STAT_ITEMS)[number]['key'], string | number> = {
    currentStreak,
    longestStreak,
    totalDaysCompleted,
    successRate: `${successRate}%`,
    timesRestarted,
  };

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5',
        className,
      )}
    >
      {STAT_ITEMS.map((item) => (
        <div
          key={item.key}
          className={cn(
            'rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center',
            itemClassName,
          )}
        >
          <p
            className={cn(
              'text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]',
              labelClassName,
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {item.label}
          </p>
          <p
            className={cn(
              'mt-1 text-2xl text-[var(--text-primary)]',
              valueClassName,
            )}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {values[item.key]}
          </p>
        </div>
      ))}
    </div>
  );
}
