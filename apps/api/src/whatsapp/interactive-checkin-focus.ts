import {
  buildMarkActivityPayload,
  type TodayActivity,
} from '../services/activities.service';
import { isActivityLogLogged } from '../utils/day-completion';
import { todayActivityToScored } from './reminder-context.service';

function canOneTapMark(activity: TodayActivity): boolean {
  if (!activity.scored || activity.isPersonal) {
    return false;
  }
  if (activity.log && isActivityLogLogged(activity.log)) {
    return false;
  }

  try {
    buildMarkActivityPayload(todayActivityToScored(activity));
    return true;
  } catch {
    return false;
  }
}

/** First scored, unlogged habit that supports one-tap completion (CHECKBOX preferred by sortOrder). */
export function pickFocusHabit(
  scoredActivities: TodayActivity[],
): TodayActivity | null {
  for (const activity of scoredActivities) {
    if (canOneTapMark(activity)) {
      return activity;
    }
  }
  return null;
}
