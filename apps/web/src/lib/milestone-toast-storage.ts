import { readStorageFlag, writeStorageFlag } from './browser-storage';

const STORAGE_PREFIX = 'hobbit:milestone-toast:';

export function milestoneToastStorageKey(
  milestoneKey: string,
  unlockedAt: Date | string,
): string {
  const at =
    unlockedAt instanceof Date
      ? unlockedAt.toISOString()
      : new Date(unlockedAt).toISOString();
  return `${milestoneKey}:${at}`;
}

export function isMilestoneToastDismissed(
  milestoneKey: string,
  unlockedAt: Date | string,
): boolean {
  return readStorageFlag(
    STORAGE_PREFIX,
    milestoneToastStorageKey(milestoneKey, unlockedAt),
  );
}

export function dismissMilestoneToast(
  milestoneKey: string,
  unlockedAt: Date | string,
): void {
  writeStorageFlag(
    STORAGE_PREFIX,
    milestoneToastStorageKey(milestoneKey, unlockedAt),
  );
}
