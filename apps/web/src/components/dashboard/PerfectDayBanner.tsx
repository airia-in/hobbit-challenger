import { PERFECT_DAY_DISMISS } from '../../lib/celebrations';

type PerfectDayBannerProps = {
  message: string;
  onDismiss: () => void;
};

export function PerfectDayBanner({ message, onDismiss }: PerfectDayBannerProps) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-3"
      data-testid="perfect-day-banner"
    >
      <p className="text-sm text-[var(--success)]">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-xs uppercase tracking-wider text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {PERFECT_DAY_DISMISS}
      </button>
    </div>
  );
}
