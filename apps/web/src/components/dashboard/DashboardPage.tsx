import { getGuidance } from '@workspace-starter/types';
import { useState } from 'react';
import {
  DayCounter,
  HeatmapGrid,
  ProofUploader,
  StatsRow,
  StreakBadge,
  TaskCard,
  XpTotalBar,
  type SubPointState,
} from '@workspace-starter/ui';
import { AuthGateInner } from '../auth/AuthGate';
import { QueryErrorState } from '../common/QueryErrorState';
import { AppShell } from '../layout/AppNav';
import { BRAND_NAME, BRAND_SUBTITLE } from '../../lib/brand';
import { TrpcProvider } from '../TrpcProvider';
import { verdictClass, verdictLabel } from '../../lib/ai-verdict';
import { getToken } from '../../lib/auth';
import { trpc } from '../../lib/trpc';
import {
  applyMutationResult,
  optimisticMarkDone,
  optimisticNumberLog,
  optimisticProofAttached,
  optimisticSubPoints,
  optimisticTierSelect,
  optimisticUndo,
  type GetTodayCache,
  type TodayActivity,
} from '../../lib/today-optimistic';

const apiUrl = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001';

function useTodayMutations() {
  const utils = trpc.useUtils();

  function settle() {
    void utils.activities.getToday.invalidate();
    void utils.stats.getDashboard.invalidate();
  }

  function createHandlers<TInput extends { activityId: string }>(
    optimisticPatch: (data: GetTodayCache, input: TInput) => GetTodayCache,
  ) {
    return {
      async onMutate(input: TInput) {
        await utils.activities.getToday.cancel();
        const previous = utils.activities.getToday.getData();
        utils.activities.getToday.setData(undefined, (old) =>
          old ? optimisticPatch(old, input) : old,
        );
        return { previous };
      },
      onSuccess(
        data: Parameters<typeof applyMutationResult>[2],
        input: TInput,
      ) {
        utils.activities.getToday.setData(undefined, (old) =>
          old ? applyMutationResult(old, input.activityId, data) : old,
        );
      },
      onError(
        _err: unknown,
        _input: TInput,
        context: { previous?: GetTodayCache } | undefined,
      ) {
        if (context?.previous) {
          utils.activities.getToday.setData(undefined, context.previous);
        }
      },
      onSettled: settle,
    };
  }

  const markActivity = trpc.activities.markActivity.useMutation(
    createHandlers((data, { activityId }) =>
      optimisticMarkDone(data, activityId),
    ),
  );

  const undoActivity = trpc.activities.undoActivity.useMutation(
    createHandlers((data, { activityId }) => optimisticUndo(data, activityId)),
  );

  const logNumber = trpc.activities.logNumber.useMutation(
    createHandlers((data, { activityId, value }) =>
      optimisticNumberLog(data, activityId, value),
    ),
  );

  const setTier = trpc.activities.setTier.useMutation(
    createHandlers((data, { activityId, tier }) =>
      optimisticTierSelect(data, activityId, tier),
    ),
  );

  const setSubPoints = trpc.activities.setSubPoints.useMutation(
    createHandlers((data, { activityId, states }) =>
      optimisticSubPoints(
        data,
        activityId,
        states as Record<string, SubPointState>,
      ),
    ),
  );

  const attachProof = trpc.activities.attachProof.useMutation({
    async onMutate(input) {
      await utils.activities.getToday.cancel();
      const previous = utils.activities.getToday.getData();
      utils.activities.getToday.setData(undefined, (old) =>
        old
          ? optimisticProofAttached(old, input.activityId, input.proofUrl)
          : old,
      );
      return { previous };
    },
    onError(
      _err: unknown,
      _input: { activityId: string; proofUrl: string },
      context: { previous?: GetTodayCache } | undefined,
    ) {
      if (context?.previous) {
        utils.activities.getToday.setData(undefined, context.previous);
      }
    },
    onSettled: settle,
  });

  const isPending =
    markActivity.isPending ||
    undoActivity.isPending ||
    logNumber.isPending ||
    setTier.isPending ||
    setSubPoints.isPending ||
    attachProof.isPending;

  return {
    markActivity,
    undoActivity,
    logNumber,
    setTier,
    setSubPoints,
    attachProof,
    isPending,
  };
}

function ProofSection({
  activity,
  canEdit,
  onAttach,
}: {
  activity: TodayActivity;
  canEdit: boolean;
  onAttach: (proofUrl: string) => void;
}) {
  if (!activity.canAttachProof) return null;

  const verdict = activity.log?.aiVerdict ?? null;
  const hasProof = Boolean(activity.log?.proofUrl);

  return (
    <div className="mt-3 space-y-2">
      <ProofUploader
        uploadUrl={`${apiUrl}/api/uploads`}
        apiBaseUrl={apiUrl}
        authToken={getToken()}
        value={activity.log?.proofUrl}
        disabled={!canEdit}
        onUploaded={onAttach}
        buttonClassName="text-xs"
      />
      {hasProof && verdict == null && (
        <p
          className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          AI check pending
        </p>
      )}
      {hasProof && verdict != null && (
        <span
          className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${verdictClass(verdict)}`}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {verdictLabel(verdict)}
        </span>
      )}
    </div>
  );
}

function ActivityCard({
  activity,
  canEdit,
  mutations,
  variant = 'scored',
}: {
  activity: TodayActivity;
  canEdit: boolean;
  mutations: ReturnType<typeof useTodayMutations>;
  variant?: 'scored' | 'personal';
}) {
  const {
    markActivity,
    undoActivity,
    logNumber,
    setTier,
    setSubPoints,
    attachProof,
    isPending,
  } = mutations;

  const askGuidance = trpc.guidance.ask.useMutation();

  return (
    <TaskCard
      icon={activity.emoji ?? '✅'}
      title={activity.title}
      kind={activity.kind}
      log={activity.log}
      canEdit={canEdit}
      xpComplete={activity.xpComplete}
      unitLabel={activity.unitLabel}
      xpPerUnit={activity.xpPerUnit}
      xpCap={activity.xpCap}
      subPoints={activity.subPoints}
      tiers={activity.tiers}
      disabled={isPending}
      className={variant === 'personal' ? 'border-dashed' : undefined}
      onMarkDone={() => markActivity.mutate({ activityId: activity.id })}
      onUndo={() => undoActivity.mutate({ activityId: activity.id })}
      onNumberCommit={(value) =>
        logNumber.mutate({ activityId: activity.id, value })
      }
      onTierSelect={(tier) => setTier.mutate({ activityId: activity.id, tier })}
      onSubPointChange={(states) =>
        setSubPoints.mutate({ activityId: activity.id, states })
      }
      guidance={getGuidance(activity.seedKey)}
      onAskGuidance={async ({ question, history }) =>
        askGuidance.mutateAsync({
          activityId: activity.id,
          question,
          history,
        })
      }
      expandedContent={
        activity.canAttachProof ? (
          <ProofSection
            activity={activity}
            canEdit={canEdit}
            onAttach={(proofUrl) =>
              attachProof.mutate({ activityId: activity.id, proofUrl })
            }
          />
        ) : undefined
      }
    />
  );
}

export function DashboardContent() {
  const [rulesOpen, setRulesOpen] = useState(false);
  const mutations = useTodayMutations();

  const activitiesQuery = trpc.activities.getToday.useQuery();
  const statsQuery = trpc.stats.getDashboard.useQuery();
  const heatmapQuery = trpc.heatmap.get.useQuery();

  if (activitiesQuery.isLoading || statsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-black)]">
        <p
          className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Loading dashboard...
        </p>
      </div>
    );
  }

  if (activitiesQuery.isError || statsQuery.isError) {
    const errorQuery = activitiesQuery.isError ? activitiesQuery : statsQuery;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-black)] px-4">
        <QueryErrorState
          message={errorQuery.error?.message}
          onRetry={() => {
            if (activitiesQuery.isError) void activitiesQuery.refetch();
            if (statsQuery.isError) void statsQuery.refetch();
          }}
        />
      </div>
    );
  }

  const stats = statsQuery.data;
  const today = activitiesQuery.data;

  const activityTitles = today
    ? [...today.scoredActivities, ...today.personalActivities].map(
        (a) => a.title,
      )
    : [];

  return (
    <div className="min-h-screen bg-[var(--bg-black)] px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
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
          {stats && (
            <StreakBadge streak={stats.currentStreak} label="day streak" />
          )}
        </header>

        {stats && (
          <DayCounter
            currentDay={stats.currentDay}
            totalDays={stats.lengthDays}
            startDate={stats.startDate}
            estimatedFinishDate={stats.estimatedFinishDate}
          />
        )}

        {today && (
          <section className="space-y-3">
            <h2
              className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Today&apos;s Activities
            </h2>

            <XpTotalBar
              netXp={today.dayTotals.netXp}
              personalXp={
                today.personalActivities.length > 0
                  ? today.dayTotals.personalXp
                  : undefined
              }
            />

            {today.scoredActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                canEdit={today.canEdit}
                mutations={mutations}
              />
            ))}

            {today.personalActivities.length > 0 && (
              <div className="mt-6 space-y-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-raised)]/50 p-4">
                <h3
                  className="text-sm uppercase tracking-wider text-[var(--text-muted)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  Personal · off leaderboard
                </h3>
                {today.personalActivities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    canEdit={today.canEdit}
                    mutations={mutations}
                    variant="personal"
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {stats && (
          <section>
            <h2
              className="mb-4 text-lg uppercase tracking-wider text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Consistency
            </h2>
            <StatsRow
              totalXp={stats.totalXp}
              todayNetXp={stats.todayNetXp}
              currentStreak={stats.currentStreak}
              longestStreak={stats.longestStreak}
              successRate={stats.successRate}
            />
          </section>
        )}

        {stats &&
          (heatmapQuery.isLoading ||
            heatmapQuery.isError ||
            heatmapQuery.data) && (
            <section>
              <h2
                className="mb-4 text-lg uppercase tracking-wider text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {stats.lengthDays}-Day Progress
              </h2>
              {heatmapQuery.isLoading ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Loading progress...
                </p>
              ) : heatmapQuery.isError ? (
                <QueryErrorState
                  message={heatmapQuery.error?.message}
                  onRetry={() => void heatmapQuery.refetch()}
                  className="text-left"
                />
              ) : heatmapQuery.data ? (
                <HeatmapGrid cells={heatmapQuery.data.cells} />
              ) : null}
            </section>
          )}

        {activityTitles.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setRulesOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm uppercase tracking-wider text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Your Activities
              <span className="text-[var(--text-muted)]">
                {rulesOpen ? '−' : '+'}
              </span>
            </button>
            {rulesOpen && (
              <ol className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-4 text-sm text-[var(--text-muted)]">
                {activityTitles.map((title) => (
                  <li key={title} className="list-decimal">
                    <span className="text-[var(--text-primary)]">{title}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <footer className="text-center">
          <a
            href="/join"
            className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)]"
          >
            Manage group →
          </a>
        </footer>
      </div>
    </div>
  );
}

export function DashboardPage({ currentPath }: { currentPath?: string }) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <DashboardContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
