import {
  CompletionHeatmapSkeleton,
  LineChartSkeleton,
  MilestoneListSkeleton,
} from '@workspace-starter/ui';

export function ProgressPageSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-8 px-4 py-8"
      role="status"
      aria-busy="true"
      aria-label="Loading progress"
    >
      <header className="space-y-2">
        <div
          className="h-10 w-40 rounded bg-[var(--skeleton-base)]"
          aria-hidden="true"
        />
        <div
          className="h-4 w-64 rounded bg-[var(--skeleton-base)]"
          aria-hidden="true"
        />
        <div
          className="h-3 w-48 rounded bg-[var(--skeleton-base)]"
          aria-hidden="true"
        />
      </header>

      <MilestoneListSkeleton />

      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div
          className="h-3 w-16 rounded bg-[var(--skeleton-base)]"
          aria-hidden="true"
        />
        <div
          className="h-10 w-full rounded-lg bg-[var(--skeleton-base)]"
          aria-hidden="true"
        />
        <LineChartSkeleton />
        <CompletionHeatmapSkeleton />
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-7 w-20 rounded-full bg-[var(--skeleton-base)]"
            />
          ))}
        </div>
        <LineChartSkeleton />
      </section>
    </div>
  );
}
