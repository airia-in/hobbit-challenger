import type { EarnedMilestone } from '@workspace-starter/types';
import { getToken } from '../../lib/auth';

const apiUrl = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001';

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

async function downloadMilestoneCard(milestoneKey: string): Promise<void> {
  const token = getToken();
  if (!token) {
    return;
  }

  const response = await fetch(
    `${apiUrl}/api/milestones/${milestoneKey}/card`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    throw new Error('Could not download milestone card');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `hobbit-${milestoneKey}.png`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
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
              <div className="flex shrink-0 flex-col items-end gap-2">
                <time
                  className="text-xs uppercase tracking-wider text-[var(--text-muted)]"
                  dateTime={new Date(milestone.unlockedAt).toISOString()}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {formatUnlockDate(milestone.unlockedAt)}
                </time>
                <button
                  type="button"
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)]"
                  data-testid={`milestone-download-${milestone.key}`}
                  onClick={() => {
                    void downloadMilestoneCard(milestone.key).catch(() => {
                      // Download failures are non-blocking for the progress view.
                    });
                  }}
                >
                  Download card
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
