/**
 * Curated milestone catalog (#134). All keys are user-scoped: streak milestones
 * and identity achievements unlock once per user across challenges.
 */
export const MILESTONE_KEYS = [
  'streak_7',
  'streak_21',
  'streak_30',
  'streak_66',
  'first_perfect_day',
  'first_perfect_week',
  'total_logs_100',
  'habit_streak_14',
  'comeback',
  'first_freeze_consumed',
] as const;

export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export type MilestoneDefinition = {
  key: MilestoneKey;
  title: string;
  description: string;
  /** Hobbit-voice copy shown on unlock toast / WhatsApp */
  unlockCopy: string;
};

export const MILESTONE_CATALOG: Record<MilestoneKey, MilestoneDefinition> = {
  streak_7: {
    key: 'streak_7',
    title: 'First week on the trail',
    description: 'Seven consecutive challenge days logged.',
    unlockCopy: 'Seven days marching — the path is starting to feel like home.',
  },
  streak_21: {
    key: 'streak_21',
    title: 'Habit forming',
    description: 'Twenty-one consecutive challenge days logged.',
    unlockCopy:
      'Twenty-one days steady — your habits are taking root on the trail.',
  },
  streak_30: {
    key: 'streak_30',
    title: 'Month of marching',
    description: 'Thirty consecutive challenge days logged.',
    unlockCopy: 'A full month on the path — that is real journey mileage.',
  },
  streak_66: {
    key: 'streak_66',
    title: 'Automaticity milestone',
    description: 'Sixty-six consecutive challenge days logged.',
    unlockCopy:
      'Sixty-six days without missing a step — the trail walks with you now.',
  },
  first_perfect_day: {
    key: 'first_perfect_day',
    title: 'Pack secured',
    description: 'Every scored habit logged in a single day.',
    unlockCopy: 'Every scored habit done — pack secured, campfire earned.',
  },
  first_perfect_week: {
    key: 'first_perfect_week',
    title: 'Perfect week',
    description: 'Seven consecutive perfect days (all scored habits logged).',
    unlockCopy:
      'Seven perfect days in a row — the trail has never looked clearer.',
  },
  total_logs_100: {
    key: 'total_logs_100',
    title: 'Century of logs',
    description: 'One hundred habit logs across your journey.',
    unlockCopy:
      'One hundred logs in the travel journal — proof the journey is real.',
  },
  habit_streak_14: {
    key: 'habit_streak_14',
    title: 'Habit devotion',
    description: 'A personal-best streak of fourteen days on one habit.',
    unlockCopy:
      'Fourteen days on a single habit — that is devotion worth celebrating.',
  },
  comeback: {
    key: 'comeback',
    title: 'Back on the trail',
    description: 'Logged again after three or more quiet days.',
    unlockCopy:
      'The trail waited while you rested — welcome back, one step at a time.',
  },
  first_freeze_consumed: {
    key: 'first_freeze_consumed',
    title: 'Rain cloak used',
    description: 'First time a streak freeze covered a missed day.',
    unlockCopy:
      'Your rain cloak did its job — the streak lives to march another day.',
  },
};

export type EarnedMilestone = {
  key: MilestoneKey;
  title: string;
  description: string;
  unlockCopy: string;
  unlockedAt: Date | string;
};

export type MilestonesPayload = {
  earned: EarnedMilestone[];
  /** Most prestigious unlock in the latest batch; client dedupes via local storage */
  latestUnlock: EarnedMilestone | null;
  /** Additional unlocks in the same batch as latestUnlock (0 when solo) */
  latestUnlockAdditionalCount: number;
};

export function getMilestoneDefinition(key: MilestoneKey): MilestoneDefinition {
  return MILESTONE_CATALOG[key];
}

/** Higher rank = more prestigious when batching unlock messages. */
export const MILESTONE_PRESTIGE_RANK: Record<MilestoneKey, number> = {
  streak_66: 100,
  streak_30: 90,
  streak_21: 80,
  first_perfect_week: 70,
  streak_7: 60,
  habit_streak_14: 50,
  total_logs_100: 40,
  first_perfect_day: 30,
  comeback: 20,
  first_freeze_consumed: 10,
};

export function compareMilestonePrestige(
  a: MilestoneKey,
  b: MilestoneKey,
): number {
  return MILESTONE_PRESTIGE_RANK[b] - MILESTONE_PRESTIGE_RANK[a];
}

export function pickMostPrestigiousMilestone(
  keys: MilestoneKey[],
): MilestoneKey | null {
  if (keys.length === 0) return null;
  return [...keys].sort(compareMilestonePrestige)[0] ?? null;
}

export function milestoneBatchSummaryLine(additionalCount: number): string {
  if (additionalCount <= 0) return '';
  const noun = additionalCount === 1 ? 'waypoint' : 'waypoints';
  return `...and ${additionalCount} more ${noun} marked on your map`;
}

/** One WhatsApp per user per local evaluation day (batched unlocks). */
export const MILESTONE_DAY_REMINDER_KIND = 'MILESTONE:DAY';

/** Major streak milestones that receive a share-card image on WhatsApp (#174). */
export const SHARE_CARD_MILESTONE_KEYS = [
  'streak_7',
  'streak_30',
  'streak_66',
] as const satisfies readonly MilestoneKey[];

export type ShareCardMilestoneKey = (typeof SHARE_CARD_MILESTONE_KEYS)[number];

export function isShareCardMilestone(
  key: MilestoneKey,
): key is ShareCardMilestoneKey {
  return (SHARE_CARD_MILESTONE_KEYS as readonly string[]).includes(key);
}

export type MilestoneCardStat = {
  label: string;
  value: string;
};

/** Deterministic stat line for milestone postcard art (#174). */
export function getMilestoneCardStat(key: MilestoneKey): MilestoneCardStat {
  switch (key) {
    case 'streak_7':
      return { label: 'Challenge streak', value: '7 days' };
    case 'streak_21':
      return { label: 'Challenge streak', value: '21 days' };
    case 'streak_30':
      return { label: 'Challenge streak', value: '30 days' };
    case 'streak_66':
      return { label: 'Challenge streak', value: '66 days' };
    case 'first_perfect_day':
      return { label: 'Perfect day', value: 'All habits' };
    case 'first_perfect_week':
      return { label: 'Perfect week', value: '7 days' };
    case 'total_logs_100':
      return { label: 'Habit logs', value: '100' };
    case 'habit_streak_14':
      return { label: 'Habit streak', value: '14 days' };
    case 'comeback':
      return { label: 'Back on trail', value: 'Return' };
    case 'first_freeze_consumed':
      return { label: 'Rain cloak', value: 'Used once' };
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function milestoneReminderKind(key: MilestoneKey): string {
  return `MILESTONE:${key}`;
}
