export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function readStorageItem(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageItem(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

export function removeStorageItem(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore quota / private mode
  }
}

export function readStorageFlag(prefix: string, key: string): boolean {
  return readStorageItem(`${prefix}${key}`) === '1';
}

export function writeStorageFlag(prefix: string, key: string): void {
  writeStorageItem(`${prefix}${key}`, '1');
}
