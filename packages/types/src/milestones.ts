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
  /** Most recent unlock for dashboard toast; client dedupes via local storage */
  latestUnlock: EarnedMilestone | null;
};

export function getMilestoneDefinition(key: MilestoneKey): MilestoneDefinition {
  return MILESTONE_CATALOG[key];
}

export function milestoneReminderKind(key: MilestoneKey): string {
  return `MILESTONE:${key}`;
}
