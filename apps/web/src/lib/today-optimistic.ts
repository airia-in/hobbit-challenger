type SubPointState = 'DONE' | 'FAILED' | 'UNLOGGED';

type DayTotals = {
  netXp: number;
  personalXp: number;
  xpEarned: number;
  xpDeducted: number;
};

type TodayActivityLog = {
  id: string;
  state: SubPointState | null;
  value: number | null;
  tier: string | null;
  subPoints: Record<string, SubPointState> | null;
  xpAwarded: number;
  proofUrl: string | null;
  aiVerdict: string | null;
};

type SubPointConfig = { key: string; label: string; xp: number };
type TierConfig = {
  key: string;
  label: string;
  maxMinutes: number | null;
  xp: number;
};

export type TodayActivity = {
  id: string;
  seedKey: string | null;
  title: string;
  emoji: string | null;
  kind: 'CHECKBOX' | 'NUMBER' | 'TIERED' | 'SUBPOINTS';
  scored: boolean;
  isPersonal: boolean;
  xpComplete?: number;
  xpMiss?: number;
  unitLabel?: string;
  xpPerUnit?: number;
  xpCap?: number;
  missXp?: number;
  subPoints?: SubPointConfig[];
  tiers?: TierConfig[];
  deductMultiplier: number;
  log: TodayActivityLog | null;
  canAttachProof: boolean;
  canEdit: boolean;
  currentStreak?: number;
};

export type GetTodayCache = {
  currentDay: number;
  date: string;
  dateKey: string;
  isViewingToday: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  canEdit: boolean;
  dayTotals: DayTotals;
  scoredActivities: TodayActivity[];
  personalActivities: TodayActivity[];
};

type ServerMutationResult = {
  log: {
    id: string;
    state: string | null;
    value: number | null;
    tier: string | null;
    subPoints: unknown;
    xpAwarded: number;
    proofUrl: string | null;
    aiVerdict: string | null;
  };
  dayTotals: DayTotals;
};

function mapServerLog(log: ServerMutationResult['log']): TodayActivityLog {
  return {
    id: log.id,
    state: log.state as SubPointState | null,
    value: log.value,
    tier: log.tier,
    subPoints: log.subPoints as Record<string, SubPointState> | null,
    xpAwarded: log.xpAwarded,
    proofUrl: log.proofUrl,
    aiVerdict: log.aiVerdict,
  };
}

function patchActivityInList<T extends TodayActivity>(
  activities: T[],
  activityId: string,
  patch: (activity: T) => T,
): T[] {
  return activities.map((activity) =>
    activity.id === activityId ? patch(activity) : activity,
  );
}

function findActivity<T extends GetTodayCache>(
  data: T,
  activityId: string,
): TodayActivity | undefined {
  return (
    data.scoredActivities.find((a) => a.id === activityId) ??
    data.personalActivities.find((a) => a.id === activityId)
  );
}

function clearCurrentStreak(activity: TodayActivity): TodayActivity {
  return { ...activity, currentStreak: undefined };
}

export function applyMutationResult<T extends GetTodayCache>(
  data: T,
  activityId: string,
  result: ServerMutationResult,
): T {
  const log = mapServerLog(result.log);
  const patch = (activity: TodayActivity): TodayActivity => ({
    ...clearCurrentStreak(activity),
    log,
  });

  return {
    ...data,
    dayTotals: result.dayTotals,
    scoredActivities: patchActivityInList(
      data.scoredActivities,
      activityId,
      patch,
    ),
    personalActivities: patchActivityInList(
      data.personalActivities,
      activityId,
      patch,
    ),
  };
}

export function optimisticMarkDone<T extends GetTodayCache>(
  data: T,
  activityId: string,
): T {
  const activity = findActivity(data, activityId);
  if (!activity) return data;

  let log: TodayActivityLog;

  if (activity.kind === 'CHECKBOX') {
    log = {
      id: activity.log?.id ?? 'optimistic',
      state: 'DONE',
      value: null,
      tier: null,
      subPoints: null,
      xpAwarded: activity.xpComplete ?? 0,
      proofUrl: activity.log?.proofUrl ?? null,
      aiVerdict: activity.log?.aiVerdict ?? null,
    };
  } else if (activity.kind === 'SUBPOINTS') {
    const subPointStates: Record<string, 'DONE'> = {};
    for (const sp of activity.subPoints ?? []) {
      subPointStates[sp.key] = 'DONE';
    }
    const xpSum = (activity.subPoints ?? []).reduce(
      (sum: number, sp: SubPointConfig) => sum + sp.xp,
      0,
    );
    log = {
      id: activity.log?.id ?? 'optimistic',
      state: 'DONE',
      value: null,
      tier: null,
      subPoints: subPointStates,
      xpAwarded: xpSum,
      proofUrl: activity.log?.proofUrl ?? null,
      aiVerdict: activity.log?.aiVerdict ?? null,
    };
  } else {
    return data;
  }

  const patch = (a: TodayActivity): TodayActivity => ({
    ...clearCurrentStreak(a),
    log,
  });
  return {
    ...data,
    scoredActivities: patchActivityInList(
      data.scoredActivities,
      activityId,
      patch,
    ),
    personalActivities: patchActivityInList(
      data.personalActivities,
      activityId,
      patch,
    ),
  };
}

export function optimisticUndo<T extends GetTodayCache>(
  data: T,
  activityId: string,
): T {
  const patch = (activity: TodayActivity): TodayActivity => ({
    ...clearCurrentStreak(activity),
    log: null,
  });
  return {
    ...data,
    scoredActivities: patchActivityInList(
      data.scoredActivities,
      activityId,
      patch,
    ),
    personalActivities: patchActivityInList(
      data.personalActivities,
      activityId,
      patch,
    ),
  };
}

export function optimisticNumberLog<T extends GetTodayCache>(
  data: T,
  activityId: string,
  value: number,
): T {
  const activity = findActivity(data, activityId);
  if (!activity || activity.kind !== 'NUMBER') return data;

  const xpPreview = Math.min(
    Math.round(value * (activity.xpPerUnit ?? 0)),
    activity.xpCap ?? 0,
  );

  const log: TodayActivityLog = {
    id: activity.log?.id ?? 'optimistic',
    state: value > 0 ? 'DONE' : null,
    value,
    tier: null,
    subPoints: null,
    xpAwarded: xpPreview,
    proofUrl: activity.log?.proofUrl ?? null,
    aiVerdict: activity.log?.aiVerdict ?? null,
  };

  const patch = (a: TodayActivity): TodayActivity => ({
    ...clearCurrentStreak(a),
    log,
  });
  return {
    ...data,
    scoredActivities: patchActivityInList(
      data.scoredActivities,
      activityId,
      patch,
    ),
    personalActivities: patchActivityInList(
      data.personalActivities,
      activityId,
      patch,
    ),
  };
}

export function optimisticTierSelect<T extends GetTodayCache>(
  data: T,
  activityId: string,
  tierKey: string,
): T {
  const activity = findActivity(data, activityId);
  if (!activity || activity.kind !== 'TIERED') return data;

  const tier = (activity.tiers ?? []).find(
    (t: TierConfig) => t.key === tierKey,
  );
  const log: TodayActivityLog = {
    id: activity.log?.id ?? 'optimistic',
    state: 'DONE',
    value: null,
    tier: tierKey,
    subPoints: null,
    xpAwarded: tier?.xp ?? 0,
    proofUrl: activity.log?.proofUrl ?? null,
    aiVerdict: activity.log?.aiVerdict ?? null,
  };

  const patch = (a: TodayActivity): TodayActivity => ({
    ...clearCurrentStreak(a),
    log,
  });
  return {
    ...data,
    scoredActivities: patchActivityInList(
      data.scoredActivities,
      activityId,
      patch,
    ),
    personalActivities: patchActivityInList(
      data.personalActivities,
      activityId,
      patch,
    ),
  };
}

export function optimisticSubPoints<T extends GetTodayCache>(
  data: T,
  activityId: string,
  states: Record<string, SubPointState>,
): T {
  const activity = findActivity(data, activityId);
  if (!activity || activity.kind !== 'SUBPOINTS') return data;

  let xpSum = 0;
  for (const sp of activity.subPoints ?? []) {
    const state = states[sp.key];
    if (state === 'DONE') xpSum += sp.xp;
  }

  const log: TodayActivityLog = {
    id: activity.log?.id ?? 'optimistic',
    state: null,
    value: null,
    tier: null,
    subPoints: states,
    xpAwarded: xpSum,
    proofUrl: activity.log?.proofUrl ?? null,
    aiVerdict: activity.log?.aiVerdict ?? null,
  };

  const patch = (a: TodayActivity): TodayActivity => ({
    ...clearCurrentStreak(a),
    log,
  });
  return {
    ...data,
    scoredActivities: patchActivityInList(
      data.scoredActivities,
      activityId,
      patch,
    ),
    personalActivities: patchActivityInList(
      data.personalActivities,
      activityId,
      patch,
    ),
  };
}

export function optimisticProofAttached<T extends GetTodayCache>(
  data: T,
  activityId: string,
  proofUrl: string,
): T {
  const activity = findActivity(data, activityId);
  const patch = (a: TodayActivity): TodayActivity => ({
    ...a,
    log: {
      id: activity?.log?.id ?? 'optimistic',
      state: activity?.log?.state ?? null,
      value: activity?.log?.value ?? null,
      tier: activity?.log?.tier ?? null,
      subPoints: activity?.log?.subPoints ?? null,
      xpAwarded: activity?.log?.xpAwarded ?? 0,
      proofUrl,
      aiVerdict: null,
    },
  });

  return {
    ...data,
    scoredActivities: patchActivityInList(
      data.scoredActivities,
      activityId,
      patch,
    ),
    personalActivities: patchActivityInList(
      data.personalActivities,
      activityId,
      patch,
    ),
  };
}
