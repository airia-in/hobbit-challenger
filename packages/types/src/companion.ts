/**
 * Hobbit companion mood model (#176). Rolling 7-day completion bands — non-punitive;
 * worst state is cozy rest (rainy), never death or guilt copy.
 */

export const COMPANION_MOODS = [
  'thriving',
  'content',
  'sleepy',
  'rainy',
] as const;

export type CompanionMood = (typeof COMPANION_MOODS)[number];

export type CompanionMoodDefinition = {
  key: CompanionMood;
  label: string;
  /** Hobbit-voice lines; pick stable line via dateKey hash */
  copyLines: readonly string[];
  /** Short aria description of visual state */
  visualDescription: string;
};

export const COMPANION_EMPTY_GARDEN_LINES = [
  'Your hobbit-hole is ready — the garden will wake as you march.',
  'A quiet mound and round door — the garden awaits your first steps.',
  'The hearth is warm, the soil is soft — march on and watch it grow.',
] as const;

export const COMPANION_MOOD_CATALOG: Record<
  CompanionMood,
  CompanionMoodDefinition
> = {
  thriving: {
    key: 'thriving',
    label: 'Garden blooming',
    copyLines: [
      'Sun on the garden — your marching pace is showing.',
      'Flowers along the path — consistency looks good on you.',
      'The hobbit-hole glows warm; the trail habits are thriving.',
    ],
    visualDescription: 'Hobbit-hole with blooming garden and sun overhead',
  },
  content: {
    key: 'content',
    label: 'Steady hearth',
    copyLines: [
      'Smoke from the chimney — steady habits, steady home.',
      'The garden grows at a good pace. Keep marching.',
      'A content hobbit-hole — your trail rhythm feels right.',
    ],
    visualDescription:
      'Hobbit-hole with gentle chimney smoke and steady growth',
  },
  sleepy: {
    key: 'sleepy',
    label: 'Dusk embers',
    copyLines: [
      'Dusk settles on the mound — a small march tomorrow will warm the embers.',
      'Tea by the hearth tonight; the garden can use a gentle nudge tomorrow.',
      'Soft evening light — no shame, just a cozy pause before the next step.',
    ],
    visualDescription: 'Hobbit-hole at dusk with dim embers and evening calm',
  },
  rainy: {
    key: 'rainy',
    label: 'Quiet rain',
    copyLines: [
      'A soft rain on the roof — good day to rest and plan the next march.',
      'The garden is taking a quiet day — lamp lit, kettle on.',
      'Cozy rain on the hobbit-hole — rest now, march when you are ready.',
    ],
    visualDescription:
      'Hobbit-hole in gentle rain with a warm lamp in the window',
  },
};

/** Mirrors heatmap cell states — duplicated here to avoid API→UI dependency. */
export type HeatmapCellState =
  | 'completed'
  | 'failed'
  | 'future'
  | 'today'
  | 'not_started';

export type CompanionDayOutcome = 'completed' | 'missed' | 'excluded';

const THRIVING_RATE = 0.85;
const CONTENT_RATE = 0.6;
const SLEEPY_RATE = 0.35;

function pickVariant<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % items.length;
  }
  return items[hash]!;
}

export function mapHeatmapStateToOutcome(
  state: HeatmapCellState,
  isTodayComplete?: boolean,
): CompanionDayOutcome {
  switch (state) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'missed';
    case 'today':
      return isTodayComplete ? 'completed' : 'missed';
    case 'not_started':
    case 'future':
      return 'excluded';
  }
}

export function computeRollingCompletionRate(input: {
  cells: ReadonlyArray<{ dayNumber: number; state: HeatmapCellState }>;
  currentDay: number;
  todayComplete?: boolean;
}): { rate: number; evaluatedDays: number; completedDays: number } {
  const windowStart = Math.max(1, input.currentDay - 6);
  const windowEnd = input.currentDay;

  let completedDays = 0;
  let missedDays = 0;

  for (const cell of input.cells) {
    if (cell.dayNumber < windowStart || cell.dayNumber > windowEnd) {
      continue;
    }
    const outcome = mapHeatmapStateToOutcome(
      cell.state,
      cell.state === 'today' ? input.todayComplete : undefined,
    );
    if (outcome === 'completed') {
      completedDays++;
    } else if (outcome === 'missed') {
      missedDays++;
    }
  }

  const evaluatedDays = completedDays + missedDays;
  const rate = evaluatedDays === 0 ? 0 : completedDays / evaluatedDays;
  return { rate, evaluatedDays, completedDays };
}

export function deriveCompanionMood(
  rate: number,
  evaluatedDays: number,
): CompanionMood {
  if (evaluatedDays === 0) {
    return 'content';
  }
  if (rate >= THRIVING_RATE) {
    return 'thriving';
  }
  if (rate >= CONTENT_RATE) {
    return 'content';
  }
  if (rate >= SLEEPY_RATE) {
    return 'sleepy';
  }
  return 'rainy';
}

export function getCompanionCopyLine(
  mood: CompanionMood,
  dateKey: string,
  evaluatedDays?: number,
): string {
  if (evaluatedDays === 0) {
    return pickVariant(COMPANION_EMPTY_GARDEN_LINES, dateKey);
  }
  return pickVariant(
    COMPANION_MOOD_CATALOG[mood].copyLines,
    `${mood}:${dateKey}`,
  );
}
