import { cn } from '../utils/cn';

export type StreakBadgeProps = {
  streak: number;
  freezesAvailable?: number;
  label?: string;
  className?: string;
};

export function StreakBadge({
  streak,
  freezesAvailable = 0,
  label = 'days on the trail',
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
      {freezesAvailable > 0 && (
        <span
          className="ml-0.5 inline-flex items-center"
          title="Rain cloak: covers one missed day this week"
          aria-label={`${freezesAvailable} rain cloak available`}
        >
          <span aria-hidden>🧥</span>
        </span>
      )}
    </span>
  );
}
