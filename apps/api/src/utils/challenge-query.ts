import type { Prisma } from '@workspace-starter/db';

/** Product default challenge length in days. */
export const DEFAULT_CHALLENGE_LENGTH_DAYS = 75;

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
