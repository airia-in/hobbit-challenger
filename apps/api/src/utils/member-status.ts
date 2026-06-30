import type { Challenge } from '@workspace-starter/db';

export type MemberStatusValue = 'ACTIVE' | 'COMPLETED';

export function getMemberStatus(
  challenge: Challenge | null,
): MemberStatusValue {
  if (!challenge || !challenge.isActive) {
    return 'COMPLETED';
  }

  if (challenge.currentDay > challenge.lengthDays) {
    return 'COMPLETED';
  }

  return 'ACTIVE';
}
