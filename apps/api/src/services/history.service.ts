import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isInterimDayCompleted,
  isInterimDayFailed,
} from '../utils/day-completion';
import type { LegacyTaskType } from './activities.service';

export type HistoryFilters = {
  taskType?: LegacyTaskType;
  dateFrom?: Date;
  dateTo?: Date;
};

export type HistoryTaskEntry = {
  type: 'task';
  id: string;
  date: Date;
  dayNumber: number | null;
  taskType: LegacyTaskType;
  completedAt: Date | null;
  proofUrl: string | null;
  aiVerdict: string | null;
  isValid: boolean;
  attemptNumber: number;
};

export type HistoryDayEntry = {
  type: 'day';
  id: string;
  date: Date;
  dayNumber: number;
  completed: boolean;
  failReason: string | null;
  attemptNumber: number;
};

export type HistoryEntry = HistoryTaskEntry | HistoryDayEntry;

const SEED_KEY_TO_TASK_TYPE: Record<string, LegacyTaskType> = {
  DIET: 'DIET',
  ACTIVITY: 'OUTDOOR_WORKOUT',
  WATER: 'WATER',
  READING: 'READING',
  PROGRESS_PHOTO: 'PROGRESS_PHOTO',
  NO_REELS: 'NO_REELS',
  NO_SOCIAL: 'NO_SOCIAL',
};

const TASK_TYPE_TO_SEED_KEY: Partial<Record<LegacyTaskType, string>> = {
  DIET: 'DIET',
  OUTDOOR_WORKOUT: 'ACTIVITY',
  INDOOR_WORKOUT: 'ACTIVITY',
  WATER: 'WATER',
  READING: 'READING',
  PROGRESS_PHOTO: 'PROGRESS_PHOTO',
  NO_REELS: 'NO_REELS',
  NO_SOCIAL: 'NO_SOCIAL',
};

export function isPassingAiVerdict(aiVerdict: string | null): boolean {
  return aiVerdict !== 'FAILED' && aiVerdict !== 'ERROR';
}

export function resolveDayFailReason(groupId: string | null): string {
  return groupId
    ? 'Not all scored activities were logged'
    : 'Not all personal activities were logged';
}

export async function listHistory(
  prisma: PrismaService,
  userId: string,
  filters: HistoryFilters = {},
): Promise<{ entries: HistoryEntry[] }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (filters.dateFrom) dateFilter.gte = filters.dateFrom;
  if (filters.dateTo) dateFilter.lte = filters.dateTo;

  const seedKeyFilter = filters.taskType
    ? TASK_TYPE_TO_SEED_KEY[filters.taskType]
    : undefined;

  const activityLogs = await prisma.activityLog.findMany({
    where: {
      userId,
      ...(seedKeyFilter ? { activity: { seedKey: seedKeyFilter } } : {}),
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    },
    orderBy: [{ date: 'desc' }],
    include: {
      activity: { select: { seedKey: true } },
      challenge: {
        select: {
          dayScores: {
            select: { date: true, dayNumber: true },
          },
        },
      },
    },
  });

  const dayScores = await prisma.dayScore.findMany({
    where: {
      challenge: { userId },
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    },
    orderBy: { date: 'desc' },
  });

  const entries: HistoryEntry[] = [];

  for (const log of activityLogs) {
    const dayScore = log.challenge.dayScores.find(
      (ds) => ds.date.getTime() === log.date.getTime(),
    );
    const seedKey = log.activity.seedKey ?? 'DIET';
    const taskType = SEED_KEY_TO_TASK_TYPE[seedKey] ?? 'DIET';

    entries.push({
      type: 'task',
      id: log.id,
      date: log.date,
      dayNumber: dayScore?.dayNumber ?? null,
      taskType,
      completedAt: log.state === 'DONE' ? log.date : null,
      proofUrl: log.proofUrl,
      aiVerdict: log.aiVerdict,
      isValid: log.state === 'DONE' && isPassingAiVerdict(log.aiVerdict),
      attemptNumber: 1,
    });
  }

  for (const day of dayScores) {
    entries.push({
      type: 'day',
      id: day.id,
      date: day.date,
      dayNumber: day.dayNumber,
      completed: isInterimDayCompleted(day),
      failReason: isInterimDayFailed(day)
        ? resolveDayFailReason(user.groupId)
        : null,
      attemptNumber: 1,
    });
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  return { entries };
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportHistoryCsv(
  prisma: PrismaService,
  userId: string,
  filters: HistoryFilters = {},
): Promise<string> {
  const { entries } = await listHistory(prisma, userId, filters);

  const headers = [
    'Type',
    'Date',
    'Day Number',
    'Task Type',
    'Completed',
    'Fail Reason',
    'Challenge',
    'AI Verdict',
    'Proof URL',
  ];

  const rows = entries.map((entry) => {
    if (entry.type === 'task') {
      return [
        'task',
        entry.date.toISOString(),
        entry.dayNumber ?? '',
        entry.taskType,
        entry.isValid ? 'yes' : 'no',
        '',
        entry.attemptNumber,
        entry.aiVerdict ?? '',
        entry.proofUrl ?? '',
      ];
    }

    return [
      'day',
      entry.date.toISOString(),
      entry.dayNumber,
      '',
      entry.completed ? 'yes' : 'no',
      entry.failReason ?? '',
      entry.attemptNumber,
      '',
      '',
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n');
}
