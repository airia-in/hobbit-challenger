import { cn } from '../utils/cn';

export type StreakBadgeProps = {
  streak: number;
  label?: string;
  className?: string;
};

export function StreakBadge({
  streak,
  label = 'day streak',
  className,
}: StreakBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium uppercase tracking-wider text-[var(--gold)]',
        className,
      )}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span aria-hidden>🔥</span>
      {streak} {label}
    </span>
  );
}
