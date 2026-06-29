const STORAGE_PREFIX = 'drcode_notification_fired';

export type NotificationKind = 'reminder' | 'warning';

function todayDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function firedTodayStorageKey(
  kind: NotificationKind,
  now: Date = new Date(),
): string {
  return `${STORAGE_PREFIX}_${kind}_${todayDateKey(now)}`;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function hasNotificationPermission(): boolean {
  return isNotificationSupported() && Notification.permission === 'granted';
}

export function wasFiredToday(kind: NotificationKind): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(firedTodayStorageKey(kind)) === '1';
}

export function markFiredToday(kind: NotificationKind): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(firedTodayStorageKey(kind), '1');
}

export function shouldFireReminder(
  reminderTime: string | null | undefined,
  now: Date,
): boolean {
  if (!reminderTime) return false;

  const match = /^(\d{2}):(\d{2})$/.exec(reminderTime);
  if (!match) return false;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return now.getHours() === hours && now.getMinutes() === minutes;
}

export function shouldFireTenPmWarning(now: Date): boolean {
  return now.getHours() === 22 && now.getMinutes() === 0;
}

export function showNotification(title: string, body: string): void {
  if (!hasNotificationPermission()) return;
  new Notification(title, { body });
}
