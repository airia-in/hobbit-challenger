import { deriveTaskStatus, type ActivityLogView } from '@workspace-starter/ui';
import type { GetTodayCache, TodayActivity } from './today-optimistic';

function toLogView(log: TodayActivity['log']): ActivityLogView | null {
  if (!log) return null;
  return {
    state: log.state,
    value: log.value,
    tier: log.tier,
    subPoints: log.subPoints,
    xpAwarded: log.xpAwarded,
    proofUrl: log.proofUrl,
    aiVerdict: log.aiVerdict,
  };
}

export function deriveActivityStatus(activity: TodayActivity) {
  return deriveTaskStatus(activity.kind, toLogView(activity.log), activity.canEdit);
}

export function isActivityCompleted(activity: TodayActivity): boolean {
  return deriveActivityStatus(activity) === 'COMPLETED';
}

export function allScoredActivitiesCompleted(today: GetTodayCache): boolean {
  if (today.scoredActivities.length === 0) return false;
  return today.scoredActivities.every(isActivityCompleted);
}

export function anyActivityCompleted(today: GetTodayCache): boolean {
  const all = [...today.scoredActivities, ...today.personalActivities];
  return all.some(isActivityCompleted);
}
