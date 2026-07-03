import type { Prisma } from '@workspace-starter/db';

/** Activity OR clauses shared by today view, streaks, finalizer, and milestones. */
export function buildUserActivityOrConditions(
  userId: string,
  groupId: string | null,
): Prisma.ActivityWhereInput[] {
  const conditions: Prisma.ActivityWhereInput[] = [
    { ownerUserId: userId, isPersonal: true, active: true },
  ];

  if (groupId) {
    conditions.unshift({ groupId, active: true, scored: true });
  } else {
    conditions.unshift({
      ownerUserId: userId,
      groupId: null,
      scored: true,
      isPersonal: false,
      active: true,
    });
  }

  return conditions;
}
