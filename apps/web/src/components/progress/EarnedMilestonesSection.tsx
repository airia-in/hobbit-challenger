import type { EarnedMilestone } from '@workspace-starter/types';

type EarnedMilestonesSectionProps = {
  milestones: EarnedMilestone[];
};

function formatUnlockDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function EarnedMilestonesSection({
  milestones,
}: EarnedMilestonesSectionProps) {
  if (milestones.length === 0) {
    return (
      <section
        className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
        data-testid="earned-milestones-section"
      >
        <h2 className="text-lg text-[var(--text-primary)]">Trail milestones</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Keep marching — your first milestone is waiting on the path ahead.
        </p>
      </section>
    );
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
      data-testid="earned-milestones-section"
    >
      <header>
        <h2 className="text-lg text-[var(--text-primary)]">Trail milestones</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {milestones.length} earned on your journey
        </p>
      </header>
      <ul className="space-y-3">
        {milestones.map((milestone) => (
          <li
            key={milestone.key}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3"
            data-testid={`milestone-earned-${milestone.key}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-[var(--text-primary)]">
                  {milestone.title}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {milestone.description}
                </p>
              </div>
              <time
                className="shrink-0 text-xs uppercase tracking-wider text-[var(--text-muted)]"
                dateTime={new Date(milestone.unlockedAt).toISOString()}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {formatUnlockDate(milestone.unlockedAt)}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
