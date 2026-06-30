import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import { challengeDisplayOrderBy } from '../utils/challenge-query';

export type GalleryFilters = {
  seedKey?: string;
  from?: Date;
  to?: Date;
};

export type GalleryPhotoEntry = {
  activityLogId: string;
  seedKey: string | null;
  title: string;
  emoji: string | null;
  proofUrl: string;
  aiVerdict: string | null;
  completedAt: Date | null;
};

export type GalleryDayGroup = {
  date: Date;
  dayNumber: number | null;
  photos: GalleryPhotoEntry[];
};

export type GalleryActivityFilter = {
  seedKey: string;
  title: string;
  emoji: string | null;
};

export type GalleryListResult = {
  days: GalleryDayGroup[];
  availableFilters: GalleryActivityFilter[];
};

export type GalleryLogRow = {
  id: string;
  date: Date;
  proofUrl: string;
  aiVerdict: string | null;
  state: string | null;
  activity: {
    seedKey: string | null;
    title: string;
    emoji: string | null;
  };
  dayNumber: number | null;
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function comparePhotos(a: GalleryPhotoEntry, b: GalleryPhotoEntry): number {
  const titleCmp = a.title.localeCompare(b.title);
  if (titleCmp !== 0) return titleCmp;
  return a.activityLogId.localeCompare(b.activityLogId);
}

export function groupGalleryPhotos(
  logs: GalleryLogRow[],
  seedKey?: string,
): GalleryDayGroup[] {
  const filtered = seedKey
    ? logs.filter((log) => log.activity.seedKey === seedKey)
    : logs;

  const byDay = new Map<string, GalleryDayGroup>();

  for (const log of filtered) {
    const key = dateKey(log.date);
    let group = byDay.get(key);
    if (!group) {
      group = {
        date: log.date,
        dayNumber: log.dayNumber,
        photos: [],
      };
      byDay.set(key, group);
    } else if (group.dayNumber == null && log.dayNumber != null) {
      group.dayNumber = log.dayNumber;
    }

    group.photos.push({
      activityLogId: log.id,
      seedKey: log.activity.seedKey,
      title: log.activity.title,
      emoji: log.activity.emoji,
      proofUrl: log.proofUrl,
      aiVerdict: log.aiVerdict,
      completedAt: log.state === 'DONE' ? log.date : null,
    });
  }

  const days = [...byDay.values()];
  for (const day of days) {
    day.photos.sort(comparePhotos);
  }

  days.sort((a, b) => b.date.getTime() - a.date.getTime());
  return days;
}

export function extractGalleryFilters(
  logs: GalleryLogRow[],
): GalleryActivityFilter[] {
  const seen = new Map<string, GalleryActivityFilter>();

  for (const log of logs) {
    const seedKey = log.activity.seedKey;
    if (!seedKey || seen.has(seedKey)) continue;
    seen.set(seedKey, {
      seedKey,
      title: log.activity.title,
      emoji: log.activity.emoji,
    });
  }

  return [...seen.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function listGallery(
  prisma: PrismaService,
  userId: string,
  filters: GalleryFilters = {},
): Promise<GalleryListResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const challenge = await prisma.challenge.findFirst({
    where: { userId },
    orderBy: challengeDisplayOrderBy,
    select: { id: true },
  });

  if (!challenge) {
    return { days: [], availableFilters: [] };
  }

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (filters.from) dateFilter.gte = filters.from;
  if (filters.to) dateFilter.lte = filters.to;

  const activityLogs = await prisma.activityLog.findMany({
    where: {
      userId,
      challengeId: challenge.id,
      proofUrl: { not: null },
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    },
    orderBy: [{ date: 'desc' }],
    include: {
      activity: {
        select: { seedKey: true, title: true, emoji: true },
      },
      challenge: {
        select: {
          dayScores: {
            select: { date: true, dayNumber: true },
          },
        },
      },
    },
  });

  const rows: GalleryLogRow[] = activityLogs
    .filter((log): log is typeof log & { proofUrl: string } =>
      Boolean(log.proofUrl),
    )
    .map((log) => {
      const dayScore = log.challenge.dayScores.find(
        (ds) => ds.date.getTime() === log.date.getTime(),
      );
      return {
        id: log.id,
        date: log.date,
        proofUrl: log.proofUrl,
        aiVerdict: log.aiVerdict,
        state: log.state,
        activity: log.activity,
        dayNumber: dayScore?.dayNumber ?? null,
      };
    });

  return {
    days: groupGalleryPhotos(rows, filters.seedKey),
    availableFilters: extractGalleryFilters(rows),
  };
}
