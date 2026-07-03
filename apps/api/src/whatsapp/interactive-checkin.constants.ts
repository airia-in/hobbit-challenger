import type { ReminderKind } from './openai-reminder.service';

export const CHECKIN_BUTTON_DONE = 'checkin:done';
export const CHECKIN_BUTTON_SNOOZE = 'checkin:snooze';
export const CHECKIN_BUTTON_REST = 'checkin:rest';

export const REST_DAY_KIND = 'REST_DAY';

export const SNOOZE_DURATION_MS = 60 * 60 * 1000;

export const INTERACTIVE_CHECKIN_REMINDER_KINDS = [
  'MORNING',
  'RECOVERY',
  'STREAK_AT_RISK',
  'EVENING',
] as const satisfies readonly ReminderKind[];

export type InteractiveCheckinReminderKind =
  (typeof INTERACTIVE_CHECKIN_REMINDER_KINDS)[number];

export function isInteractiveCheckinReminderKind(
  kind: ReminderKind,
): kind is InteractiveCheckinReminderKind {
  return (INTERACTIVE_CHECKIN_REMINDER_KINDS as readonly string[]).includes(
    kind,
  );
}

export function snoozeKindFor(baseKind: ReminderKind): string {
  return `SNOOZE_${baseKind}`;
}

export type CheckinReplyKind = 'done' | 'snooze' | 'rest';

const DONE_TEXT_PATTERN = /^(done|✅|✓|check)$/i;
const SNOOZE_TEXT_PATTERN = /^(later|snooze|remind)$/i;
const REST_TEXT_PATTERN = /^rest$/i;

const BUTTON_ID_TO_REPLY: Record<string, CheckinReplyKind> = {
  [CHECKIN_BUTTON_DONE]: 'done',
  [CHECKIN_BUTTON_SNOOZE]: 'snooze',
  [CHECKIN_BUTTON_REST]: 'rest',
};

export function replyKindFromButtonId(
  buttonId: string | undefined,
): CheckinReplyKind | null {
  if (!buttonId) {
    return null;
  }
  return BUTTON_ID_TO_REPLY[buttonId] ?? null;
}

export function replyKindFromText(text: string): CheckinReplyKind | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (DONE_TEXT_PATTERN.test(trimmed)) {
    return 'done';
  }
  if (SNOOZE_TEXT_PATTERN.test(trimmed)) {
    return 'snooze';
  }
  if (REST_TEXT_PATTERN.test(trimmed)) {
    return 'rest';
  }
  return null;
}
