import { getGuidance } from '@workspace-starter/types';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { FirstWeekChecklist } from '../onboarding/FirstWeekChecklist';
import { BRAND_NAME, BRAND_SUBTITLE } from '../../lib/brand';
import {
  getPerfectDayBanner,
  getStreakRecoveryCta,
  JOURNEY_LABELS,
  pickEasiestUnloggedScoredHabit,
  taskCardDomId,
} from '../../lib/celebrations';
import {
  clearPerfectDayCelebrated,
  hasPerfectDayBeenCelebrated,
  markPerfectDayCelebrated,
} from '../../lib/perfect-day-storage';
import {
  dismissStreakRecovery,
  isStreakRecoveryDismissed,
} from '../../lib/streak-recovery-storage';
import { TrpcProvider } from '../TrpcProvider';
import { getToken } from '../../lib/auth';
import { trpc } from '../../lib/trpc';
import {
  allScoredActivitiesCompleted,
  anyActivityCompleted,
  isActivityCompleted,
} from '../../lib/today-completion';
import { useActivityCelebrations } from '../../lib/use-activity-celebrations';
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
import { PerfectDayBanner } from './PerfectDayBanner';
import { PerfectDayCelebration } from './PerfectDayCelebration';
import { StreakRecoveryBanner } from './StreakRecoveryBanner';

const apiUrl = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001';

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return utc.toISOString().slice(0, 10);
}

function formatActivitiesHeading(day: GetTodayCache): string {
  if (day.isViewingToday) {
    return "Today's Activities";
  }
  const label = new Date(`${day.dateKey}T12:00:00`).toLocaleDateString(
    undefined,
    { weekday: 'short', month: 'short', day: 'numeric' },
  );
  return `Activities · ${label}`;
}

function useTodayMutations(viewedDateKey?: string) {
  const utils = trpc.useUtils();
  const queryInput = viewedDateKey ? { date: viewedDateKey } : undefined;
  const mutationDate =
    viewedDateKey !== undefined ? { date: viewedDateKey } : {};

  function settle() {
    void utils.activities.getToday.invalidate();
    void utils.stats.getDashboard.invalidate();
  }

  function createHandlers<TInput extends { activityId: string; date?: string }>(
    optimisticPatch: (data: GetTodayCache, input: TInput) => GetTodayCache,
  ) {
    return {
      async onMutate(input: TInput) {
        await utils.activities.getToday.cancel(queryInput);
        const previous = utils.activities.getToday.getData(queryInput);
        utils.activities.getToday.setData(queryInput, (old) =>
          old ? optimisticPatch(old, input) : old,
        );
        return { previous };
      },
      onSuccess(
        data: Parameters<typeof applyMutationResult>[2],
        input: TInput,
      ) {
        utils.activities.getToday.setData(queryInput, (old) =>
          old ? applyMutationResult(old, input.activityId, data) : old,
        );
      },
      onError(
        _err: unknown,
        _input: TInput,
        context: { previous?: GetTodayCache } | undefined,
      ) {
        if (context?.previous) {
          utils.activities.getToday.setData(queryInput, context.previous);
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
      await utils.activities.getToday.cancel(queryInput);
      const previous = utils.activities.getToday.getData(queryInput);
      utils.activities.getToday.setData(queryInput, (old) =>
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
        utils.activities.getToday.setData(queryInput, context.previous);
      }
    },
    onSettled: settle,
  });

  const withDate = <T extends { activityId: string }>(input: T) => ({
    ...input,
    ...mutationDate,
  });

  const isPending =
    markActivity.isPending ||
    undoActivity.isPending ||
    logNumber.isPending ||
    setTier.isPending ||
    setSubPoints.isPending ||
    attachProof.isPending;

  return {
    markActivity: {
      ...markActivity,
      mutate: (input: { activityId: string }) =>
        markActivity.mutate(withDate(input)),
    },
    undoActivity: {
      ...undoActivity,
      mutate: (input: { activityId: string }) =>
        undoActivity.mutate(withDate(input)),
    },
    logNumber: {
      ...logNumber,
      mutate: (input: { activityId: string; value: number }) =>
        logNumber.mutate(withDate(input)),
    },
    setTier: {
      ...setTier,
      mutate: (input: { activityId: string; tier: string }) =>
        setTier.mutate(withDate(input)),
    },
    setSubPoints: {
      ...setSubPoints,
      mutate: (input: {
        activityId: string;
        states: Record<string, SubPointState>;
      }) => setSubPoints.mutate(withDate(input)),
    },
    attachProof: {
      ...attachProof,
      mutate: (input: { activityId: string; proofUrl: string }) =>
        attachProof.mutate(withDate(input)),
    },
    isPending,
  };
}

function ProofSection({
  activity,
  onAttach,
}: {
  activity: TodayActivity;
  onAttach: (proofUrl: string) => void;
}) {
  if (!activity.canAttachProof) return null;

  const hasProof = Boolean(activity.log?.proofUrl);

  return (
    <div className="mt-3 space-y-2">
      <ProofUploader
        uploadUrl={`${apiUrl}/api/uploads`}
        apiBaseUrl={apiUrl}
        authToken={getToken()}
        value={activity.log?.proofUrl}
        capture="environment"
        disabled={!activity.canEdit}
        onUploaded={onAttach}
        buttonClassName="text-xs"
      />
      {hasProof && (
        <p
          className="text-[10px] uppercase tracking-wider text-[var(--success)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {activity.autoCompleteOnProof
            ? 'Proof attached — marked done'
            : 'Proof attached'}
        </p>
      )}
    </div>
  );
}

function ActivityCard({
  activity,
  mutations,
  variant = 'scored',
  celebrationLine,
  highlighted = false,
}: {
  activity: TodayActivity;
  mutations: ReturnType<typeof useTodayMutations>;
  variant?: 'scored' | 'personal';
  celebrationLine?: string;
  highlighted?: boolean;
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
      domId={taskCardDomId(activity.id)}
      icon={activity.emoji ?? '✅'}
      title={activity.title}
      kind={activity.kind}
      log={activity.log}
      canEdit={activity.canEdit}
      xpComplete={activity.xpComplete}
      unitLabel={activity.unitLabel}
      xpPerUnit={activity.xpPerUnit}
      xpCap={activity.xpCap}
      currentStreak={activity.currentStreak}
      celebrationLine={celebrationLine}
      subPoints={activity.subPoints}
      tiers={activity.tiers}
      defaultExpanded
      disabled={isPending}
      className={
        highlighted
          ? variant === 'personal'
            ? 'border-dashed ring-2 ring-[var(--accent-red)]/60 ring-offset-2 ring-offset-[var(--bg-black)]'
            : 'ring-2 ring-[var(--accent-red)]/60 ring-offset-2 ring-offset-[var(--bg-black)]'
          : variant === 'personal'
            ? 'border-dashed'
            : undefined
      }
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
  const [viewedDateKey, setViewedDateKey] = useState<string | undefined>(
    undefined,
  );
  const [perfectDayBannerDismissed, setPerfectDayBannerDismissed] =
    useState(false);
  const [recoveryDismissedSession, setRecoveryDismissedSession] =
    useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(
    null,
  );
  const confettiTriggeredRef = useRef(false);
  const prevAllScoredCompleteRef = useRef<boolean | null>(null);
  const queryInput = viewedDateKey ? { date: viewedDateKey } : undefined;
  const mutations = useTodayMutations(viewedDateKey);

  const activitiesQuery = trpc.activities.getToday.useQuery(queryInput);
  const statsQuery = trpc.stats.getDashboard.useQuery();
  const heatmapQuery = trpc.heatmap.get.useQuery();
  const profileQuery = trpc.profile.get.useQuery();

  const stats = statsQuery.data;
  const today = activitiesQuery.data;

  const { celebrationLines } = useActivityCelebrations(
    today,
    stats?.currentStreak,
  );

  const allScoredComplete =
    today != null &&
    today.isViewingToday &&
    allScoredActivitiesCompleted(today);

  const brokeOnDate = stats?.streakBreak?.brokeOnDate ?? null;
  const recoveryDismissedStorage =
    brokeOnDate != null ? isStreakRecoveryDismissed(brokeOnDate) : false;

  const easiestUnloggedHabit =
    today != null
      ? pickEasiestUnloggedScoredHabit(
          today.scoredActivities,
          isActivityCompleted,
        )
      : null;
  const recoveryCtaLabel = easiestUnloggedHabit
    ? getStreakRecoveryCta(easiestUnloggedHabit.title)
    : "See today's habits";

  useEffect(() => {
    confettiTriggeredRef.current = false;
    prevAllScoredCompleteRef.current = null;
  }, [today?.dateKey]);

  useEffect(() => {
    setRecoveryDismissedSession(false);
  }, [brokeOnDate]);

  useEffect(() => {
    if (!today?.isViewingToday) return;
    const prev = prevAllScoredCompleteRef.current;
    prevAllScoredCompleteRef.current = allScoredComplete;
    if (prev === true && !allScoredComplete) {
      clearPerfectDayCelebrated(today.dateKey);
      confettiTriggeredRef.current = false;
      setPerfectDayBannerDismissed(false);
    }
  }, [today, allScoredComplete]);

  useEffect(() => {
    if (!today?.isViewingToday || !allScoredComplete) return;
    if (today.scoredActivities.length === 0) return;
    if (hasPerfectDayBeenCelebrated(today.dateKey)) return;
    if (confettiTriggeredRef.current) return;

    confettiTriggeredRef.current = true;
    markPerfectDayCelebrated(today.dateKey);
    setConfettiActive(true);
  }, [today, allScoredComplete]);

  const handleConfettiDone = useCallback(() => {
    setConfettiActive(false);
  }, []);

  const handleRecoveryDismiss = useCallback(() => {
    if (brokeOnDate) dismissStreakRecovery(brokeOnDate);
    setRecoveryDismissedSession(true);
  }, [brokeOnDate]);

  const handleScrollToEasiestHabit = useCallback(() => {
    const targetId = easiestUnloggedHabit
      ? taskCardDomId(easiestUnloggedHabit.id)
      : 'today-tasks';
    document.getElementById(targetId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    if (easiestUnloggedHabit) {
      setHighlightedTaskId(easiestUnloggedHabit.id);
      window.setTimeout(() => setHighlightedTaskId(null), 2500);
    }
  }, [easiestUnloggedHabit]);

  const showRecoveryBanner =
    stats?.streakBreak?.occurred === true &&
    today?.isViewingToday === true &&
    brokeOnDate != null &&
    !recoveryDismissedSession &&
    !recoveryDismissedStorage &&
    !allScoredComplete;

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
            <StreakBadge
              streak={stats.currentStreak}
              label={JOURNEY_LABELS.streakPlural}
            />
          )}
        </header>

        {showRecoveryBanner && stats && (
          <StreakRecoveryBanner
            previousStreak={stats.streakBreak.previousStreak}
            longestStreak={stats.longestStreak}
            daysSinceBreak={stats.streakBreak.daysSinceBreak}
            ctaLabel={recoveryCtaLabel}
            onDismiss={handleRecoveryDismiss}
            onScrollToTasks={handleScrollToEasiestHabit}
          />
        )}

        {stats && (
          <DayCounter
            currentDay={stats.currentDay}
            totalDays={stats.lengthDays}
            startDate={stats.startDate}
            estimatedFinishDate={stats.estimatedFinishDate}
          />
        )}

        {stats && today && (
          <FirstWeekChecklist
            currentDay={stats.currentDay}
            hasReminder={Boolean(profileQuery.data?.reminderTime)}
            hasCompletedHabit={anyActivityCompleted(today)}
          />
        )}

        {today && (
          <section id="today-tasks" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                data-testid="dashboard-date-prev"
                disabled={!today.canNavigateBack}
                onClick={() =>
                  setViewedDateKey(shiftDateKey(today.dateKey, -1))
                }
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm uppercase tracking-wider text-[var(--text-primary)] transition hover:border-[var(--accent-red)]/50 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ fontFamily: 'var(--font-mono)' }}
                aria-label="Previous day"
              >
                ←
              </button>
              <h2
                className="min-w-0 flex-1 text-center text-lg uppercase tracking-wider text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {formatActivitiesHeading(today)}
              </h2>
              <button
                type="button"
                data-testid="dashboard-date-next"
                disabled={!today.canNavigateForward}
                onClick={() => setViewedDateKey(shiftDateKey(today.dateKey, 1))}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm uppercase tracking-wider text-[var(--text-primary)] transition hover:border-[var(--accent-red)]/50 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ fontFamily: 'var(--font-mono)' }}
                aria-label="Next day"
              >
                →
              </button>
            </div>

            <XpTotalBar
              netXp={today.dayTotals.netXp}
              personalXp={
                today.personalActivities.length > 0
                  ? today.dayTotals.personalXp
                  : undefined
              }
            />

            {allScoredComplete &&
              !perfectDayBannerDismissed &&
              today.scoredActivities.length > 0 && (
                <PerfectDayBanner
                  message={getPerfectDayBanner(today.dateKey)}
                  onDismiss={() => setPerfectDayBannerDismissed(true)}
                />
              )}

            {today.scoredActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                mutations={mutations}
                celebrationLine={celebrationLines[activity.id]}
                highlighted={highlightedTaskId === activity.id}
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
                    mutations={mutations}
                    variant="personal"
                    celebrationLine={celebrationLines[activity.id]}
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
              labels={{
                todayNetXp: JOURNEY_LABELS.pathXpToday,
                currentStreak: JOURNEY_LABELS.trailStreak,
              }}
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

        <PerfectDayCelebration
          active={confettiActive}
          onDone={handleConfettiDone}
        />
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
