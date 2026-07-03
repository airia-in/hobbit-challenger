import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DayEvaluatorService } from '../src/cron/day-evaluator.service';
import * as milestonesService from '../src/services/milestones.service';
import { addLocalDays } from '../src/utils/day-window';

describe('DayEvaluatorService — milestone policy', () => {
  const timezone = 'America/New_York';
  const startDate = new Date('2026-06-10T04:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T15:00:00.000Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function baseUser(challengeOverrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      name: 'Sam',
      phone: '+15551234567',
      whatsappOptIn: true,
      timezone,
      reminderTime: null,
      groupId: 'group-1',
      group: { challengeTimezone: timezone },
      challenges: [
        {
          id: 'ch-1',
          startDate,
          endDate: null,
          currentDay: 8,
          lengthDays: 30,
          longestStreak: 7,
          currentStreak: 7,
          streakFreezesAvailable: 0,
          streakFreezesUsed: 0,
          lastStreakFreezeGrantedAt: null,
          isActive: true,
          ...challengeOverrides,
        },
      ],
    };
  }

  it('self-heals milestone evaluation once per finalized day', async () => {
    const evaluateSpy = vi
      .spyOn(milestonesService, 'evaluateAndUnlockMilestones')
      .mockResolvedValue({ newlyUnlocked: ['streak_7'] });

    const prisma = {
      user: { findMany: async () => [baseUser()] },
      activity: {
        findMany: async () => [
          {
            id: 'act-1',
            groupId: 'group-1',
            scored: true,
            isPersonal: false,
            active: true,
            kind: 'CHECKBOX',
          },
        ],
      },
      dayScore: {
        findFirst: async () => ({
          finalized: true,
          breakdown: { allScoredLogged: true },
        }),
      },
      $transaction: async () => undefined,
    };

    const trySendBatchUnlockMessage = vi.fn().mockResolvedValue(undefined);
    const service = new DayEvaluatorService(prisma as never, undefined, {
      trySendBatchUnlockMessage,
    } as never);

    await service.evaluateDays();

    expect(evaluateSpy).toHaveBeenCalledTimes(1);
    expect(trySendBatchUnlockMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryMilestoneKey: 'streak_7',
        additionalUnlockCount: 0,
      }),
    );
  });

  it('skips milestone rescan on steady-state cron ticks for finalized days', async () => {
    const evaluateSpy = vi
      .spyOn(milestonesService, 'evaluateAndUnlockMilestones')
      .mockResolvedValue({ newlyUnlocked: [] });

    const prisma = {
      user: { findMany: async () => [baseUser()] },
      activity: {
        findMany: async () => [
          {
            id: 'act-1',
            groupId: 'group-1',
            scored: true,
            isPersonal: false,
            active: true,
            kind: 'CHECKBOX',
          },
        ],
      },
      dayScore: {
        findFirst: async () => ({
          finalized: true,
          breakdown: { allScoredLogged: true },
        }),
      },
      $transaction: async () => undefined,
    };

    const service = new DayEvaluatorService(prisma as never);

    await service.evaluateDays();
    await service.evaluateDays();

    expect(evaluateSpy).toHaveBeenCalledTimes(1);
  });

  it('sends milestone message on challenge completion night', async () => {
    const completionDay = addLocalDays(startDate, 1, timezone);
    vi.setSystemTime(addLocalDays(completionDay, 1, timezone));

    const evaluateSpy = vi
      .spyOn(milestonesService, 'evaluateAndUnlockMilestones')
      .mockResolvedValue({ newlyUnlocked: ['streak_66', 'streak_7'] });

    const prisma = {
      user: {
        findMany: async () => [
          baseUser({
            endDate: completionDay,
            currentDay: 2,
            lengthDays: 2,
            currentStreak: 65,
            longestStreak: 66,
          }),
        ],
      },
      activity: {
        findMany: async () => [
          {
            id: 'act-1',
            groupId: 'group-1',
            scored: true,
            isPersonal: false,
            active: true,
            kind: 'CHECKBOX',
          },
        ],
      },
      dayScore: {
        findFirst: async () => null,
        findMany: async () => [],
      },
      activityLog: {
        findMany: async () => [
          {
            challengeId: 'ch-1',
            userId: 'user-1',
            activityId: 'act-1',
            date: completionDay,
            state: 'DONE',
            tier: null,
            value: null,
            subPoints: null,
          },
        ],
      },
      reminderLog: {
        findUnique: async () => null,
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          dayScore: {
            findUnique: async () => null,
            upsert: async () => undefined,
          },
          challenge: {
            update: async () => undefined,
          },
        };
        await fn(tx);
      },
    };

    const trySendBatchUnlockMessage = vi.fn().mockResolvedValue(undefined);
    const service = new DayEvaluatorService(prisma as never, undefined, {
      trySendBatchUnlockMessage,
    } as never);

    await service.evaluateDays();

    expect(evaluateSpy).toHaveBeenCalled();
    expect(trySendBatchUnlockMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryMilestoneKey: 'streak_66',
        additionalUnlockCount: 1,
      }),
    );
  });
});
