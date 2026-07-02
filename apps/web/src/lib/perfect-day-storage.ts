import {
  readStorageItem,
  removeStorageItem,
  writeStorageItem,
} from './browser-storage';

const STORAGE_PREFIX = 'hobbit:perfect-day:';
const CELEBRATED_KEY = `${STORAGE_PREFIX}celebrated`;

export function getPerfectDayCelebratedDate(): string | null {
  return readStorageItem(CELEBRATED_KEY);
}

export function markPerfectDayCelebrated(dateKey: string): void {
  writeStorageItem(CELEBRATED_KEY, dateKey);
}

export function hasPerfectDayBeenCelebrated(dateKey: string): boolean {
  return getPerfectDayCelebratedDate() === dateKey;
}

export function clearPerfectDayCelebrated(dateKey: string): void {
  if (getPerfectDayCelebratedDate() === dateKey) {
    removeStorageItem(CELEBRATED_KEY);
  }
}
