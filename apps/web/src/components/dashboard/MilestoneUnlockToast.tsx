import { useEffect } from 'react';
import type { EarnedMilestone } from '@workspace-starter/types';
import { PERFECT_DAY_DISMISS } from '../../lib/celebrations';

const AUTO_DISMISS_MS = 8000;

type MilestoneUnlockToastProps = {
  milestone: EarnedMilestone;
  onDismiss: () => void;
};

export function MilestoneUnlockToast({
  milestone,
  onDismiss,
}: MilestoneUnlockToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-lg border border-[var(--gold)]/40 bg-[var(--surface)] px-4 py-3 shadow-lg"
      data-testid="milestone-unlock-toast"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p
            className="text-xs uppercase tracking-wider text-[var(--gold)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Milestone unlocked
          </p>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {milestone.title}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            {milestone.unlockCopy}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs uppercase tracking-wider text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {PERFECT_DAY_DISMISS}
        </button>
      </div>
    </div>
  );
}
