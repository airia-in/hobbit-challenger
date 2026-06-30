import { describe, expect, it, vi } from 'vitest';
import { galleryRouter } from '../src/trpc/routers/gallery.router';
import type { Context } from '../src/trpc/context';

const USER_ID = 'user-gallery';
const OTHER_ID = 'user-other';
const CHALLENGE_ID = 'challenge-1';

type StoredLog = {
  id: string;
  userId: string;
  challengeId: string;
  date: Date;
  proofUrl: string | null;
  aiVerdict: string | null;
  state: string | null;
  activity: {
    seedKey: string | null;
    title: string;
    emoji: string | null;
  };
  challenge: {
    dayScores: Array<{ date: Date; dayNumber: number }>;
  };
};

function createGalleryContext(logs: StoredLog[]): Context {
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === USER_ID ? { id: USER_ID } : null,
      ),
    },
    challenge: {
      findFirst: vi.fn(async () => ({ id: CHALLENGE_ID })),
    },
    activityLog: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
            challengeId: string;
            proofUrl: { not: null };
          };
        }) =>
          logs.filter(
            (log) =>
              log.userId === where.userId &&
              log.challengeId === where.challengeId &&
              log.proofUrl != null,
          ),
      ),
    },
  };

  return {
    req: { headers: {} } as Context['req'],
    res: {} as Context['res'],
    user: { id: USER_ID, email: null, phone: null, name: 'Gallery User' },
    prisma: prisma as unknown as Context['prisma'],
    authService: {} as Context['authService'],
    activitiesService: {} as Context['activitiesService'],
    guidanceService: {} as Context['guidanceService'],
  };
}

describe('galleryRouter.list', () => {
  it('returns grouped days with only proof-bearing caller logs', async () => {
    const dayOne = new Date('2026-06-01T00:00:00.000Z');
    const dayTwo = new Date('2026-06-02T00:00:00.000Z');

    const logs: StoredLog[] = [
      {
        id: 'log-with-proof',
        userId: USER_ID,
        challengeId: CHALLENGE_ID,
        date: dayOne,
        proofUrl: '/uploads/proof.jpg',
        aiVerdict: 'PASSED',
        state: 'DONE',
        activity: {
          seedKey: 'PROGRESS_PHOTO',
          title: 'Progress Photo',
          emoji: '📸',
        },
        challenge: {
          dayScores: [{ date: dayOne, dayNumber: 1 }],
        },
      },
      {
        id: 'log-no-proof',
        userId: USER_ID,
        challengeId: CHALLENGE_ID,
        date: dayTwo,
        proofUrl: null,
        aiVerdict: null,
        state: 'DONE',
        activity: {
          seedKey: 'WATER',
          title: 'Water',
          emoji: '💧',
        },
        challenge: { dayScores: [] },
      },
      {
        id: 'other-user-proof',
        userId: OTHER_ID,
        challengeId: CHALLENGE_ID,
        date: dayTwo,
        proofUrl: '/uploads/other.jpg',
        aiVerdict: 'PASSED',
        state: 'DONE',
        activity: {
          seedKey: 'PROGRESS_PHOTO',
          title: 'Progress Photo',
          emoji: '📸',
        },
        challenge: { dayScores: [] },
      },
    ];

    const caller = galleryRouter.createCaller(createGalleryContext(logs));
    const result = await caller.list();

    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.dayNumber).toBe(1);
    expect(result.days[0]?.photos).toHaveLength(1);
    expect(result.days[0]?.photos[0]).toMatchObject({
      activityLogId: 'log-with-proof',
      seedKey: 'PROGRESS_PHOTO',
      proofUrl: '/uploads/proof.jpg',
      aiVerdict: 'PASSED',
    });
    expect(result.availableFilters).toEqual([
      {
        seedKey: 'PROGRESS_PHOTO',
        title: 'Progress Photo',
        emoji: '📸',
      },
    ]);
  });

  it('applies seedKey filter through listGallery', async () => {
    const dayOne = new Date('2026-06-01T00:00:00.000Z');

    const logs: StoredLog[] = [
      {
        id: 'progress',
        userId: USER_ID,
        challengeId: CHALLENGE_ID,
        date: dayOne,
        proofUrl: '/uploads/progress.jpg',
        aiVerdict: 'PASSED',
        state: 'DONE',
        activity: {
          seedKey: 'PROGRESS_PHOTO',
          title: 'Progress Photo',
          emoji: '📸',
        },
        challenge: { dayScores: [{ date: dayOne, dayNumber: 1 }] },
      },
      {
        id: 'reels',
        userId: USER_ID,
        challengeId: CHALLENGE_ID,
        date: dayOne,
        proofUrl: '/uploads/reels.jpg',
        aiVerdict: 'PASSED',
        state: 'DONE',
        activity: {
          seedKey: 'NO_REELS',
          title: 'No Reels',
          emoji: '📵',
        },
        challenge: { dayScores: [{ date: dayOne, dayNumber: 1 }] },
      },
    ];

    const caller = galleryRouter.createCaller(createGalleryContext(logs));
    const result = await caller.list({ seedKey: 'NO_REELS' });

    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.photos).toHaveLength(1);
    expect(result.days[0]?.photos[0]?.seedKey).toBe('NO_REELS');
    expect(result.availableFilters).toHaveLength(2);
  });
});
