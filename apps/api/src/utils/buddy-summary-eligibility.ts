import { isWinbackEligible } from './winback-dormancy';
import {
  getWeeklyRecapSkipReason,
  isWeeklyRecapSlotDue,
  shouldRetryWeeklyRecap,
  type WeeklyRecapEligibleRange,
} from './weekly-recap-eligibility';

/** ReminderLog kind for opt-in accountability buddy summaries (#178). */
export const BUDDY_SUMMARY_KIND = 'BUDDY_SUMMARY';

type ChallengeLike = {
  startDate: Date;
  endDate: Date | null;
  lengthDays: number;
  currentDay: number;
  isActive: boolean;
  stoppedAt: Date | null;
};

export type BuddySummarySubjectSkipReason =
  | 'no_challenge'
  | 'not_sunday'
  | 'challenge_ended_before_week'
  | 'insufficient_eligible_days'
  | 'zero_activity'
  | 'partner_dormant';

/**
 * Decides whether the *partner's* week is worth summarizing for their buddy.
 *
 * Reuses the weekly-recap eligibility matrix (opt-in/phone/WhatsApp forced true
 * because delivery gating is the recipient's concern, not the subject's) so the
 * "skip if partner dormant" acceptance criterion and the privacy rule (only
 * share a week the partner actually showed up for) share one implementation.
 */
export function getBuddySummarySubjectSkipReason(input: {
  challenge: ChallengeLike | null;
  challengeTimezone: string;
  lastActivityDate: Date | null;
  lastWinbackSentAt: Date | null;
  activityDatesInWeek: string[];
  eligibleRange?: WeeklyRecapEligibleRange;
  now?: Date;
}): BuddySummarySubjectSkipReason | null {
  const reason = getWeeklyRecapSkipReason({
    challenge: input.challenge,
    challengeTimezone: input.challengeTimezone,
    lastActivityDate: input.lastActivityDate,
    lastWinbackSentAt: input.lastWinbackSentAt,
    activityDatesInWeek: input.activityDatesInWeek,
    weeklyRecapOptIn: true,
    whatsappOptIn: true,
    hasPhone: true,
    eligibleRange: input.eligibleRange,
    now: input.now,
  });

  switch (reason) {
    case null:
      return null;
    case 'no_challenge':
    case 'not_sunday':
    case 'challenge_ended_before_week':
    case 'insufficient_eligible_days':
    case 'zero_activity':
      return reason;
    // A dormant partner (winback-eligible) must never be summarized — this is
    // the supportive, non-surveillance guarantee.
    case 'winback_precedence':
      return 'partner_dormant';
    // opt_out / no_phone / no_whatsapp cannot occur (forced true above).
    default:
      return 'no_challenge';
  }
}

/**
 * True when the recipient is themselves dormant. Dormant members get a win-back,
 * not a cheerful buddy ping — buddy summaries defer to win-back precedence.
 */
export function isBuddySummaryRecipientDormant(input: {
  challenge: ChallengeLike | null;
  challengeTimezone: string;
  lastActivityDate: Date | null;
  lastWinbackSentAt: Date | null;
  now?: Date;
}): boolean {
  if (!input.challenge) {
    return true;
  }
  return isWinbackEligible({
    lastActivityDate: input.lastActivityDate,
    challengeStartDate: input.challenge.startDate,
    challengeTimezone: input.challengeTimezone,
    challenge: input.challenge,
    lastWinbackSentAt: input.lastWinbackSentAt,
    now: input.now,
  });
}

/** Retry only FAILED rows; SENT/SKIPPED_OPTOUT are terminal (matches recap). */
export function shouldRetryBuddySummary(
  existing: { status: string } | null | undefined,
): boolean {
  return shouldRetryWeeklyRecap(existing);
}

/** Sunday ~10:00 slot gate — shares the recap cadence window. */
export function isBuddySummarySlotDue(input: {
  timezone: string;
  logThisWeek: { status: string } | null | undefined;
  now?: Date;
}): boolean {
  return isWeeklyRecapSlotDue({
    timezone: input.timezone,
    recapLogThisWeek: input.logThisWeek,
    now: input.now,
  });
}
