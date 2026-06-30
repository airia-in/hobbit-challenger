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
 * after local midnight, so a user who has already logged every scored activity
 * today should optimistically see streak + 1 until the day is finalized. Returns
 * the stored streak unchanged when the day is not yet fully logged (the day is
 * not over, so it is never reset here — the finalizer owns resets).
 */
export async function getLiveStreak(
  prisma: PrismaService,
  { challengeId, userId, groupId, timezone, storedStreak }: LiveStreakParams,
): Promise<number> {
  if (!groupId) {
    return storedStreak;
  }

  const scoredActivities = await prisma.activity.findMany({
    where: { groupId, active: true, scored: true },
    select: { id: true },
  });

  if (scoredActivities.length === 0) {
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

  return computeCurrentStreak(
    storedStreak,
    todayLogs,
    scoredActivities.map((activity) => activity.id),
  );
}
