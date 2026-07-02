import {
  getStreakRecoveryMessage,
  STREAK_RECOVERY_DISMISS,
} from '../../lib/celebrations';

type StreakRecoveryBannerProps = {
  previousStreak: number;
  longestStreak: number;
  daysSinceBreak: number;
  ctaLabel: string;
  onDismiss: () => void;
  onScrollToTasks: () => void;
};

export function StreakRecoveryBanner({
  previousStreak,
  longestStreak,
  daysSinceBreak,
  ctaLabel,
  onDismiss,
  onScrollToTasks,
}: StreakRecoveryBannerProps) {
  const message = getStreakRecoveryMessage({
    previousStreak,
    longestStreak,
    daysSinceBreak,
  });

  return (
    <div
      className="flex items-start justify-between gap-3 rounded-lg border border-[var(--accent-red)]/25 bg-[var(--accent-red)]/5 px-4 py-3"
      data-testid="streak-recovery-banner"
      data-variant={daysSinceBreak <= 1 ? 'fresh-break' : 'never-miss-twice'}
    >
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm text-[var(--text-primary)]">{message}</p>
        <button
          type="button"
          onClick={onScrollToTasks}
          className="rounded-md border border-[var(--accent-red)]/40 bg-[var(--surface)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--accent-red)] transition hover:border-[var(--accent-red)]/70"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {ctaLabel}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-xs uppercase tracking-wider text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {STREAK_RECOVERY_DISMISS}
      </button>
    </div>
  );
}
