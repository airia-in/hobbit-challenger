import { useMemo, useState } from 'react';
import {
  CompletionHeatmap,
  LineChart,
  StreakBadge,
} from '@workspace-starter/ui';
import { AuthGateInner } from '../auth/AuthGate';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';

type ActivityOption = {
  id: string;
  title: string;
  emoji: string | null;
  kind: string;
};

type LeaderboardWindow = 'today' | 'week' | 'total';
type LeaderboardMetric = 'cumulative' | 'daily';

const WINDOW_OPTIONS: { value: LeaderboardWindow; label: string }[] = [
  { value: 'total', label: 'Challenge' },
  { value: 'week', label: 'This week' },
  { value: 'today', label: 'Today' },
];

const METRIC_OPTIONS: { value: LeaderboardMetric; label: string }[] = [
  { value: 'cumulative', label: 'Cumulative XP' },
  { value: 'daily', label: 'Daily XP' },
];

function isNumberKind(kind: string): boolean {
  return kind === 'NUMBER';
}

function isCompletionKind(kind: string): boolean {
  return kind === 'CHECKBOX' || kind === 'SUBPOINTS' || kind === 'TIERED';
}

function ProgressContent() {
  const today = trpc.activities.getToday.useQuery();
  const dashboard = trpc.stats.getDashboard.useQuery();
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  );
  const [leaderboardWindow, setLeaderboardWindow] =
    useState<LeaderboardWindow>('total');
  const [leaderboardMetric, setLeaderboardMetric] =
    useState<LeaderboardMetric>('cumulative');

  const activities = useMemo<ActivityOption[]>(() => {
    if (!today.data) return [];
    return [
      ...today.data.scoredActivities,
      ...today.data.personalActivities,
    ].map((activity) => ({
      id: activity.id,
      title: activity.title,
      emoji: activity.emoji,
      kind: activity.kind,
    }));
  }, [today.data]);

  const selectedActivity =
    activities.find((activity) => activity.id === selectedActivityId) ??
    activities[0] ??
    null;

  const range = useMemo(() => {
    const to = dashboard.data?.todayDate ?? new Date();
    const from = dashboard.data?.startDate ?? to;
    return { from, to };
  }, [dashboard.data]);

  const activitySeries = trpc.stats.activitySeries.useQuery(
    {
      activityId: selectedActivity?.id ?? '',
      from: range.from,
      to: range.to,
    },
    {
      enabled:
        Boolean(selectedActivity?.id) &&
        isNumberKind(selectedActivity.kind) &&
        Boolean(dashboard.data),
    },
  );

  const activityCompletion = trpc.stats.activityCompletion.useQuery(
    {
      activityId: selectedActivity?.id ?? '',
      from: range.from,
      to: range.to,
    },
    {
      enabled:
        Boolean(selectedActivity?.id) &&
        isCompletionKind(selectedActivity.kind) &&
        Boolean(dashboard.data),
    },
  );

  const leaderboardSeries = trpc.leaderboard.series.useQuery({
    window: leaderboardWindow,
    metric: leaderboardMetric,
  });

  if (today.isLoading || dashboard.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Loading progress...
        </p>
      </div>
    );
  }

  const seriesChartData =
    activitySeries.data?.map((point) => ({
      date: point.date,
      value: point.value,
    })) ?? [];

  const leaderboardChartSeries =
    leaderboardSeries.data?.members.map((member) => ({
      label: member.isSelf ? `${member.name} (you)` : member.name,
      points: member.points.map((point) => ({
        date: point.date,
        value: point.xp,
      })),
      color: member.isSelf ? 'var(--accent-red)' : undefined,
    })) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header>
        <h1
          className="text-3xl text-[var(--text-primary)] sm:text-4xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Progress
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Per-activity trends and squad XP comparison
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)]">
          Activity
        </label>
        {activities.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No activities yet. Join a group or add personal activities from your
            profile.
          </p>
        ) : (
          <select
            value={selectedActivity?.id ?? ''}
            onChange={(event) => setSelectedActivityId(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.emoji ? `${activity.emoji} ` : ''}
                {activity.title}
              </option>
            ))}
          </select>
        )}

        {selectedActivity && isNumberKind(selectedActivity.kind) ? (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">
              Value over time
            </h2>
            {activitySeries.isLoading ? (
              <p className="text-sm text-[var(--text-muted)]">
                Loading chart...
              </p>
            ) : (
              <LineChart
                series={[
                  {
                    label: selectedActivity.title,
                    points: seriesChartData,
                  },
                ]}
                valueLabel="Value"
              />
            )}
          </div>
        ) : null}

        {selectedActivity && isCompletionKind(selectedActivity.kind) ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                Completion
              </h2>
              {activityCompletion.data ? (
                <StreakBadge streak={activityCompletion.data.streak} />
              ) : null}
            </div>

            {activityCompletion.isLoading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading...</p>
            ) : activityCompletion.data ? (
              <>
                {activityCompletion.data.rateByWeek.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {activityCompletion.data.rateByWeek.map((week) => (
                      <div
                        key={week.weekStart}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-center"
                      >
                        <p className="text-xs text-[var(--text-muted)]">
                          Week of {week.weekStart.slice(5)}
                        </p>
                        <p
                          className="text-xl text-[var(--text-primary)]"
                          style={{ fontFamily: 'var(--font-display)' }}
                        >
                          {week.rate}%
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                <CompletionHeatmap days={activityCompletion.data.days} />
              </>
            ) : (
              <CompletionHeatmap days={[]} />
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg text-[var(--text-primary)]">
              Leaderboard XP
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Your line is always shown
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLeaderboardWindow(option.value)}
                className={`rounded-full px-3 py-1 text-xs uppercase tracking-wider ${
                  leaderboardWindow === option.value
                    ? 'bg-[var(--accent-red)] text-white'
                    : 'border border-[var(--border)] text-[var(--text-muted)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {METRIC_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setLeaderboardMetric(option.value)}
              className={`rounded-full px-3 py-1 text-xs uppercase tracking-wider ${
                leaderboardMetric === option.value
                  ? 'bg-[var(--gold)]/20 text-[var(--gold)]'
                  : 'border border-[var(--border)] text-[var(--text-muted)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {leaderboardSeries.isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading chart...</p>
        ) : leaderboardSeries.isError ? (
          <p className="text-sm text-[var(--text-muted)]">
            Join a group to compare XP with your squad.
          </p>
        ) : (
          <LineChart
            series={leaderboardChartSeries}
            valueLabel="XP"
            emptyMessage="No leaderboard data yet"
          />
        )}
      </section>
    </div>
  );
}

export function ProgressPage({
  currentPath = '/progress',
}: {
  currentPath?: string;
}) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <ProgressContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
