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

export type DashboardStats = {
  totalXp: number;
  todayNetXp: number;
  currentDay: number;
  lengthDays: number;
  startDate: Date | null;
  todayDate: Date;
  estimatedFinishDate: Date | null;
  currentStreak: number;
  longestStreak: number;
  totalDaysCompleted: number;
  successRate: number;
  streakBreak: StreakBreak;
  streakFreezesAvailable: number;
  streakFreezesUsed: number;
};
