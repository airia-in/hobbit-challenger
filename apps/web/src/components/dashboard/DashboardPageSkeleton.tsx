import {
  CompanionPanelSkeleton,
  DayCounterSkeleton,
  HeatmapGridSkeleton,
  JourneyPathSkeleton,
  StatsRowSkeleton,
  TaskCardSkeleton,
  XpTotalBarSkeleton,
} from '@workspace-starter/ui';
import { BRAND_NAME, BRAND_SUBTITLE } from '../../lib/brand';

export function DashboardPageSkeleton() {
  return (
    <div
      className="min-h-screen bg-[var(--bg-base)] px-4 py-8"
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex items-center justify-between">
          <div className="space-y-2">
            <p
              className="text-2xl text-[var(--accent-red)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {BRAND_NAME}
            </p>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
              {BRAND_SUBTITLE}
            </p>
          </div>
          <div
            className="h-10 w-20 rounded-full border border-[var(--border)] bg-[var(--surface)]"
            aria-hidden="true"
          />
        </header>

        <DayCounterSkeleton />

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div
              className="h-10 w-12 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
              aria-hidden="true"
            />
            <div
              className="h-5 flex-1 rounded bg-[var(--skeleton-base)]"
              aria-hidden="true"
            />
            <div
              className="h-10 w-12 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
              aria-hidden="true"
            />
          </div>
          <XpTotalBarSkeleton />
          {Array.from({ length: 4 }, (_, index) => (
            <TaskCardSkeleton key={index} />
          ))}
        </section>

        <section>
          <div
            className="mb-4 h-5 w-28 rounded bg-[var(--skeleton-base)]"
            aria-hidden="true"
          />
          <StatsRowSkeleton />
        </section>

        <JourneyPathSkeleton />
        <HeatmapGridSkeleton />
        <CompanionPanelSkeleton />
      </div>
    </div>
  );
}
