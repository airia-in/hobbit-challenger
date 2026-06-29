import { TaskType } from '@workspace-starter/db';
import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';

export type HistoryFilters = {
  taskType?: TaskType;
  dateFrom?: Date;
  dateTo?: Date;
};

export type HistoryTaskEntry = {
  type: 'task';
  id: string;
  date: Date;
  dayNumber: number | null;
  taskType: TaskType;
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

export type HistoryRestartEntry = {
  type: 'restart';
  date: Date;
  attemptNumber: number;
  reason: string | null;
};

export type HistoryEntry = HistoryTaskEntry | HistoryDayEntry | HistoryRestartEntry;

export async function listHistory(
  prisma: PrismaService,
  userId: string,
  filters: HistoryFilters = {},
): Promise<{ entries: HistoryEntry[] }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const attempts = await prisma.attempt.findMany({
    where: { userId },
    orderBy: { attemptNumber: 'asc' },
    select: { id: true, attemptNumber: true, startDate: true },
  });

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (filters.dateFrom) dateFilter.gte = filters.dateFrom;
  if (filters.dateTo) dateFilter.lte = filters.dateTo;

  const taskLogs = await prisma.taskLog.findMany({
    where: {
      userId,
      ...(filters.taskType ? { taskType: filters.taskType } : {}),
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    },
    orderBy: [{ date: 'desc' }, { completedAt: 'desc' }],
    include: {
      attempt: {
        select: {
          attemptNumber: true,
          dayResults: {
            select: { date: true, dayNumber: true },
          },
        },
      },
    },
  });

  const dayResults = await prisma.dayResult.findMany({
    where: {
      attempt: { userId },
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    },
    orderBy: { date: 'desc' },
    include: { attempt: { select: { attemptNumber: true } } },
  });

  const entries: HistoryEntry[] = [];

  for (const log of taskLogs) {
    const dayResult = log.attempt.dayResults.find(
      (dr) => dr.date.getTime() === log.date.getTime(),
    );

    entries.push({
      type: 'task',
      id: log.id,
      date: log.date,
      dayNumber: dayResult?.dayNumber ?? null,
      taskType: log.taskType,
      completedAt: log.completedAt,
      proofUrl: log.proofUrl,
      aiVerdict: log.aiVerdict,
      isValid: log.isValid,
      attemptNumber: log.attempt.attemptNumber,
    });
  }

  for (const day of dayResults) {
    entries.push({
      type: 'day',
      id: day.id,
      date: day.date,
      dayNumber: day.dayNumber,
      completed: day.completed,
      failReason: day.failReason,
      attemptNumber: day.attempt.attemptNumber,
    });

    if (!day.completed) {
      entries.push({
        type: 'restart',
        date: day.failedAt ?? day.date,
        attemptNumber: day.attempt.attemptNumber + 1,
        reason: day.failReason,
      });
    }
  }

  for (let i = 1; i < attempts.length; i++) {
    const prev = attempts[i - 1]!;
    const curr = attempts[i]!;
    const alreadyHasRestart = entries.some(
      (e) => e.type === 'restart' && e.attemptNumber === curr.attemptNumber,
    );
    if (!alreadyHasRestart) {
      entries.push({
        type: 'restart',
        date: curr.startDate,
        attemptNumber: curr.attemptNumber,
        reason: 'Challenge restarted',
      });
    }
  }

  entries.sort((a, b) => {
    const dateA = a.type === 'restart' ? a.date : a.date;
    const dateB = b.type === 'restart' ? b.date : b.date;
    return dateB.getTime() - dateA.getTime();
  });

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
    'Attempt',
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
    if (entry.type === 'day') {
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
    }
    return [
      'restart',
      entry.date.toISOString(),
      '',
      '',
      '',
      entry.reason ?? '',
      entry.attemptNumber,
      '',
      '',
    ];
  });

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}
