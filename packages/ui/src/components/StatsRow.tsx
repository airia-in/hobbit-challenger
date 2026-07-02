import { cn } from '../utils/cn';

export type StatsRowProps = {
  totalXp: number;
  todayNetXp: number;
  currentStreak: number;
  longestStreak: number;
  successRate: number;
  labels?: Partial<Record<(typeof STAT_ITEMS)[number]['key'], string>>;
  className?: string;
  itemClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
};

const STAT_ITEMS = [
  { key: 'totalXp', label: 'Total XP' },
  { key: 'todayNetXp', label: 'Path XP today' },
  { key: 'currentStreak', label: 'Trail streak' },
  { key: 'longestStreak', label: 'Longest Streak' },
  { key: 'successRate', label: 'Success Rate' },
] as const;

export function StatsRow({
  totalXp,
  todayNetXp,
  currentStreak,
  longestStreak,
  successRate,
  labels,
  className,
  itemClassName,
  labelClassName,
  valueClassName,
}: StatsRowProps) {
  const values: Record<(typeof STAT_ITEMS)[number]['key'], string | number> = {
    totalXp,
    todayNetXp,
    currentStreak,
    longestStreak,
    successRate: `${successRate}%`,
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
            {labels?.[item.key] ?? item.label}
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
