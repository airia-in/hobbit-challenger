import {
  CHECKIN_BUTTON_DONE,
  CHECKIN_BUTTON_REST,
  CHECKIN_BUTTON_SNOOZE,
} from './interactive-checkin.constants';
import type { SendButtonsInput } from './evolution.client';

const TEXT_FALLBACK_FOOTER = 'Reply DONE, LATER, or REST';

export function buildCheckinButtons(): SendButtonsInput {
  return {
    description: '',
    footer: TEXT_FALLBACK_FOOTER,
    buttons: [
      { id: CHECKIN_BUTTON_DONE, displayText: 'Done ✓' },
      { id: CHECKIN_BUTTON_SNOOZE, displayText: 'Remind me in 1hr' },
      { id: CHECKIN_BUTTON_REST, displayText: 'Rest day' },
    ],
  };
}

export function buildCheckinTextFallback(description: string): string {
  const trimmed = description.trimEnd();
  return `${trimmed}\n\n${TEXT_FALLBACK_FOOTER}`;
}

export function buildInteractiveReminderPayload(
  description: string,
): SendButtonsInput {
  return {
    ...buildCheckinButtons(),
    description,
  };
}
