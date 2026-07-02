const STORAGE_PREFIX = 'hobbit:perfect-day:';

export function getPerfectDayCelebratedDate(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}celebrated`);
  } catch {
    return null;
  }
}

export function markPerfectDayCelebrated(dateKey: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE_PREFIX}celebrated`, dateKey);
}

export function hasPerfectDayBeenCelebrated(dateKey: string): boolean {
  return getPerfectDayCelebratedDate() === dateKey;
}
