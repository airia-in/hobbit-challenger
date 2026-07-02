export type ChallengeRange = {
  startDate: string;
  endDate: string;
  lengthDays: number;
  currentDay: number;
  timezone: string;
};

export type StreakBreak = {
  occurred: boolean;
  previousStreak: number;
  brokeOnDate: string | null;
  daysSinceBreak: number;
};
