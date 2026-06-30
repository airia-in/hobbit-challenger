import type { Prisma } from '@workspace-starter/db';

export const challengeDisplayOrderBy: Prisma.ChallengeOrderByWithRelationInput[] =
  [{ isActive: 'desc' }, { startDate: 'desc' }];

export function latestChallengeRelationArgs() {
  return {
    orderBy: challengeDisplayOrderBy,
    take: 1,
  } as const;
}

export function activeChallengeRelationArgs() {
  return {
    where: { isActive: true },
    orderBy: { startDate: 'desc' as const },
    take: 1,
  } as const;
}
