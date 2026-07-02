import { BUILTIN_SEED_KEYS } from '@workspace-starter/types';

export const JOURNEY_LABELS = {
  streakBadge: 'days on the trail',
  streakSingular: 'day on the trail',
  streakPlural: 'days on the trail',
  pathXpToday: 'Path XP today',
  trailStreak: 'Trail streak',
  fellowTravelers: 'Fellow travelers',
} as const;

export const PERFECT_DAY_BANNERS = [
  'Every scored habit logged — the trail is clear today.',
  'Pack secured, campfire earned. Perfect day on the trail.',
  'All habits done. Hobbit approves of this marching pace.',
] as const;

export const PERFECT_DAY_DISMISS = 'Onward';

type CelebrationInput = {
  seedKey: string | null;
  title: string;
  currentStreak?: number;
  challengeStreak?: number;
};

const HABIT_CELEBRATIONS: Record<(typeof BUILTIN_SEED_KEYS)[number], string[]> =
  {
    DIET: [
      'Wholesome fuel for the road ahead.',
      'Your pack is stocked with good choices.',
      'Trail rations: excellent.',
    ],
    ACTIVITY: [
      'Legs moving, spirit rising — fine marching.',
      'The trail knows you walked it today.',
      'Muscles earned their rest by the campfire.',
    ],
    WATER: [
      'Hydration secured — a traveler’s best friend.',
      'Your waterskin is full. Onward.',
      'Clear streams crossed, thirst quenched.',
    ],
    READING: [
      'A chapter by lamplight — wisdom gathered.',
      'Pages turned, mind sharpened for the trail.',
      'Stories stowed in your traveling pack.',
    ],
    PROGRESS_PHOTO: [
      'Snapshot saved — the journey has proof.',
      'Another mile documented on the trail.',
      'Progress captured before the next bend.',
    ],
    NO_REELS: [
      'Eyes on the path, not the scroll.',
      'Distractions left behind at the last crossing.',
      'Focus kept — the trail rewards attention.',
    ],
    NO_SOCIAL: [
      'Quiet trail, clear head.',
      'No detours into the noise today.',
      'Social trails skipped — yours is the real one.',
    ],
  };

const GENERIC_CELEBRATIONS = [
  'Another habit checked off the trail map.',
  'Well marched — keep the pace.',
  'Done and dusted. The pack feels lighter.',
  'One more step on a good journey.',
];

const STREAK_SUFFIXES = [
  (n: number) =>
    ` — ${n} ${n === 1 ? 'day' : 'days'} on the trail and counting.`,
  (n: number) => ` ${n} ${n === 1 ? 'day' : 'days'} strong on this path.`,
  (n: number) =>
    ` The trail remembers this ${n}-${n === 1 ? 'day' : 'day'} stretch.`,
];

function pickVariant<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % items.length;
  }
  return items[hash]!;
}

function isBuiltinSeedKey(
  seedKey: string,
): seedKey is (typeof BUILTIN_SEED_KEYS)[number] {
  return (BUILTIN_SEED_KEYS as readonly string[]).includes(seedKey);
}

export function getTaskCelebrationLine({
  seedKey,
  title,
  currentStreak,
  challengeStreak,
}: CelebrationInput): string {
  const dayKey = new Date().toISOString().slice(0, 10);
  const variantSeed = `${seedKey ?? title}:${dayKey}`;

  const base =
    seedKey && isBuiltinSeedKey(seedKey)
      ? pickVariant(HABIT_CELEBRATIONS[seedKey], variantSeed)
      : pickVariant(GENERIC_CELEBRATIONS, variantSeed);

  const streak = currentStreak ?? challengeStreak;
  if (streak != null && streak > 0) {
    const suffixFn = pickVariant(STREAK_SUFFIXES, `${variantSeed}:streak`);
    return `${base}${suffixFn(streak)}`;
  }

  return base;
}

export function getPerfectDayBanner(dateKey: string): string {
  return pickVariant(PERFECT_DAY_BANNERS, dateKey);
}

export const STREAK_RECOVERY_CTA = "See today's habits";
export const STREAK_RECOVERY_DISMISS = PERFECT_DAY_DISMISS;

type StreakRecoveryInput = {
  previousStreak: number;
  longestStreak: number;
  daysSinceBreak: number;
};

export function getStreakRecoveryMessage({
  previousStreak,
  longestStreak,
  daysSinceBreak,
}: StreakRecoveryInput): string {
  if (daysSinceBreak <= 1) {
    return `Rainy day on the trail yesterday — streak paused at ${previousStreak}, best run ${longestStreak} — not forgotten. One rest day happens. Want a small win to get moving?`;
  }

  return `One rest day on the trail is fine — best not to miss twice. Your best run was ${longestStreak} days. Pick one habit and keep marching.`;
}
