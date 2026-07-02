const STORAGE_PREFIX = 'hobbit:streak-recovery:';

export function isStreakRecoveryDismissed(brokeOnDate: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${brokeOnDate}`) === '1';
  } catch {
    return false;
  }
}

export function dismissStreakRecovery(brokeOnDate: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${brokeOnDate}`, '1');
  } catch {
    // ignore quota / private mode
  }
}
