import type { PrismaService } from '../prisma/prisma.service';
import { computeCurrentStreak } from './day-completion';
import { getUserLocalDate } from './day-window';

type LiveStreakParams = {
  challengeId: string;
  userId: string;
  groupId: string | null;
  timezone: string;
  storedStreak: number;
};

/**
 * Live streak for display: the finalizer only updates `Challenge.currentStreak`
 * after local midnight, so a user who has already logged every gating activity
 * today should optimistically see streak + 1 until the day is finalized. Grouped
 * users gate on scored group activities; groupless users gate on their personal
 * activities. Returns the stored streak unchanged when the day is not yet fully
 * logged (the day is not over, so it is never reset here — the finalizer owns
 * resets).
 */
export async function getLiveStreak(
  prisma: PrismaService,
  { challengeId, userId, groupId, timezone, storedStreak }: LiveStreakParams,
): Promise<number> {
  const orConditions: Array<Record<string, unknown>> = [
    { ownerUserId: userId, isPersonal: true, active: true },
  ];
  if (groupId) {
    orConditions.unshift({ groupId, active: true, scored: true });
  }

  const activities = await prisma.activity.findMany({
    where: { OR: orConditions },
    select: { id: true, scored: true, isPersonal: true },
  });

  const scoredActivities = activities.filter(
    (activity) => activity.scored && !activity.isPersonal,
  );
  const personalActivities = activities.filter(
    (activity) => activity.isPersonal,
  );

  const gatingIds =
    scoredActivities.length > 0
      ? scoredActivities.map((activity) => activity.id)
      : groupId
        ? []
        : personalActivities.map((activity) => activity.id);

  if (gatingIds.length === 0) {
    return storedStreak;
  }

  const today = getUserLocalDate(timezone);
  const todayLogs = await prisma.activityLog.findMany({
    where: { challengeId, userId, date: today },
    select: {
      activityId: true,
      state: true,
      tier: true,
      value: true,
      subPoints: true,
    },
  });

  return computeCurrentStreak(storedStreak, todayLogs, gatingIds);
}
