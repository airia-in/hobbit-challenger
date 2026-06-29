import type { Attempt } from '@workspace-starter/db';

export type MemberStatusValue = 'ACTIVE' | 'ELIMINATED' | 'COMPLETED';

export function getMemberStatus(attempt: Attempt | null): MemberStatusValue {
  if (!attempt || !attempt.isActive) {
    return 'ELIMINATED';
  }

  if (attempt.currentDay > 75) {
    return 'COMPLETED';
  }

  if (attempt.timesRestarted > 0 && attempt.currentDay === 1) {
    return 'ELIMINATED';
  }

  if (attempt.currentDay >= 1) {
    return 'ACTIVE';
  }

  return 'ELIMINATED';
}
