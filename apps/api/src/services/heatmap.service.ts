import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';

export type HeatmapCellState =
  | 'completed'
  | 'failed'
  | 'future'
  | 'today'
  | 'not_started';

export type HeatmapCell = {
  dayNumber: number;
  state: HeatmapCellState;
  dayLabel: string | null;
};

export async function getHeatmap(
  prisma: PrismaService,
  userId: string,
): Promise<{ cells: HeatmapCell[]; isGroupAdmin: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      group: {
        include: { dayLabels: true },
      },
      attempts: {
        where: { isActive: true },
        take: 1,
        include: { dayResults: true },
      },
    },
  });

  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const attempt = user.attempts[0] ?? null;
  const labelMap = new Map(
    (user.group?.dayLabels ?? []).map((label) => [
      label.dayNumber,
      label.labelText,
    ]),
  );

  const resultsByDay = new Map(
    (attempt?.dayResults ?? []).map((result) => [result.dayNumber, result]),
  );

  const currentDay = attempt?.currentDay ?? 1;
  const isActive = attempt?.isActive ?? false;

  const cells: HeatmapCell[] = [];

  for (let dayNumber = 1; dayNumber <= 75; dayNumber++) {
    let state: HeatmapCellState;

    if (!attempt) {
      state = 'not_started';
    } else if (dayNumber > 75 || (currentDay > 75 && dayNumber > 75)) {
      state = 'not_started';
    } else if (currentDay > 75) {
      const result = resultsByDay.get(dayNumber);
      if (result?.completed) state = 'completed';
      else if (result && !result.completed) state = 'failed';
      else state = 'not_started';
    } else if (dayNumber === currentDay && isActive) {
      state = 'today';
    } else if (dayNumber > currentDay) {
      state = 'future';
    } else {
      const result = resultsByDay.get(dayNumber);
      if (result?.completed) state = 'completed';
      else if (result && !result.completed) state = 'failed';
      else state = 'not_started';
    }

    cells.push({
      dayNumber,
      state,
      dayLabel: labelMap.get(dayNumber) ?? null,
    });
  }

  const isGroupAdmin = user.group?.adminUserId === userId;

  return { cells, isGroupAdmin };
}

export async function setDayLabel(
  prisma: PrismaService,
  userId: string,
  dayNumber: number,
  labelText: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.groupId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No group found' });
  }

  const group = await prisma.group.findUnique({ where: { id: user.groupId } });

  if (!group) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
  }

  if (group.adminUserId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
  }

  if (dayNumber < 1 || dayNumber > 75) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Day must be 1–75' });
  }

  const label = await prisma.dayLabel.upsert({
    where: {
      groupId_dayNumber: {
        groupId: user.groupId,
        dayNumber,
      },
    },
    create: {
      groupId: user.groupId,
      dayNumber,
      labelText,
      setByUserId: userId,
    },
    update: {
      labelText,
      setByUserId: userId,
    },
  });

  return label;
}
