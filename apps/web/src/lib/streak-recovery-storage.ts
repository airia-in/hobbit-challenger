import { readStorageFlag, writeStorageFlag } from './browser-storage';

const STORAGE_PREFIX = 'hobbit:streak-recovery:';

export function isStreakRecoveryDismissed(brokeOnDate: string): boolean {
  return readStorageFlag(STORAGE_PREFIX, brokeOnDate);
}

export function dismissStreakRecovery(brokeOnDate: string): void {
  writeStorageFlag(STORAGE_PREFIX, brokeOnDate);
}
