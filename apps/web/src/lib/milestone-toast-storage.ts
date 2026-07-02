import { readStorageFlag, writeStorageFlag } from './browser-storage';

const STORAGE_PREFIX = 'hobbit:milestone-toast:';

export function isMilestoneToastDismissed(milestoneKey: string): boolean {
  return readStorageFlag(STORAGE_PREFIX, milestoneKey);
}

export function dismissMilestoneToast(milestoneKey: string): void {
  writeStorageFlag(STORAGE_PREFIX, milestoneKey);
}
