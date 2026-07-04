import {
  LeaderboardTableSkeleton,
  PodiumBlockSkeleton,
} from '@workspace-starter/ui';
import { JOURNEY_LABELS } from '../../lib/celebrations';

export function LeaderboardPageSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-8 px-4 py-8"
      role="status"
      aria-busy="true"
      aria-label="Loading leaderboard"
    >
      <header className="space-y-2">
        <h1
          className="text-3xl text-[var(--text-primary)] sm:text-4xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {JOURNEY_LABELS.fellowTravelers}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Travelers on the trail · refreshes every 60s
        </p>
      </header>

      <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 md:flex md:gap-2 md:rounded-none md:border-0 md:bg-transparent md:p-0">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-8 rounded-md bg-[var(--skeleton-base)] md:h-9 md:w-24 md:rounded-full"
            aria-hidden="true"
          />
        ))}
      </div>

      <PodiumBlockSkeleton />
      <LeaderboardTableSkeleton />
    </div>
  );
}
