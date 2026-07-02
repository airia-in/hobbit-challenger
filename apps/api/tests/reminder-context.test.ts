import { describe, expect, it } from 'vitest';
import type {
  GetTodayResult,
  TodayActivity,
} from '../src/services/activities.service';
import {
  buildReminderContextFromFixture,
  computeXpAtRisk,
  countTasksFromToday,
  hasEveningReminderEligibility,
} from '../src/whatsapp/reminder-context.service';

function scoredActivity(
  overrides: Partial<TodayActivity> & { id: string },
): TodayActivity {
  return {
    id: overrides.id,
    seedKey: null,
    title: overrides.title ?? 'Task',
    emoji: null,
    kind: 'CHECKBOX',
    scored: true,
    isPersonal: false,
    xpComplete: 100,
    xpMiss: -100,
    deductMultiplier: 2,
    log: null,
    canAttachProof: true,
    ...overrides,
  };
}

function emptyToday(overrides: Partial<GetTodayResult> = {}): GetTodayResult {
  return {
    currentDay: 5,
    date: new Date('2026-06-15T00:00:00.000Z'),
    dateKey: '2026-06-15',
    isViewingToday: true,
    canNavigateBack: true,
    canNavigateForward: false,
    canEdit: true,
    dayTotals: { netXp: 0, personalXp: 0, xpEarned: 0, xpDeducted: 0 },
    scoredActivities: [],
    personalActivities: [],
    ...overrides,
  };
}

describe('reminder-context helpers', () => {
  it('counts done and remaining tasks', () => {
    const activities = [
      scoredActivity({
        id: 'a1',
        log: {
          id: 'l1',
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 100,
          proofUrl: null,
          aiVerdict: null,
        },
      }),
      scoredActivity({ id: 'a2', log: null }),
      scoredActivity({ id: 'a3', log: null }),
    ];

    expect(countTasksFromToday(activities)).toEqual({
      tasksDone: 1,
      tasksRemaining: 2,
    });
  });

  it('computes xpAtRisk from unlogged scored activities', () => {
    const activities = [
      scoredActivity({
        id: 'a1',
        xpMiss: -200,
        log: {
          id: 'l1',
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 100,
          proofUrl: null,
          aiVerdict: null,
        },
      }),
      scoredActivity({ id: 'a2', xpMiss: -200, log: null }),
    ];

    // Grace rate is 0.5, so unlogged a2 risks 100 XP deduction at grace
    expect(computeXpAtRisk(activities)).toBe(100);
  });

  it('builds full context from fixture', () => {
    const today = emptyToday({
      scoredActivities: [
        scoredActivity({
          id: 'a1',
          log: {
            id: 'l1',
            state: 'DONE',
            value: null,
            tier: null,
            subPoints: null,
            xpAwarded: 100,
            proofUrl: null,
            aiVerdict: null,
          },
        }),
        scoredActivity({ id: 'a2', xpMiss: -200, log: null }),
      ],
    });

    const context = buildReminderContextFromFixture({
      name: 'Alex',
      today,
      todayNetXp: 50,
      totalXp: 1500,
      rank: 2,
    });

    expect(context).toEqual({
      name: 'Alex',
      dayNumber: 5,
      tasksDone: 1,
      tasksRemaining: 1,
      todayNetXp: 50,
      xpAtRisk: 100,
      rank: 2,
      totalXp: 1500,
    });
  });

  it('evening eligibility requires incomplete tasks or xp at risk', () => {
    expect(
      hasEveningReminderEligibility({
        name: 'A',
        dayNumber: 1,
        tasksDone: 3,
        tasksRemaining: 0,
        todayNetXp: 100,
        xpAtRisk: 0,
        rank: null,
        totalXp: 100,
      }),
    ).toBe(false);

    expect(
      hasEveningReminderEligibility({
        name: 'A',
        dayNumber: 1,
        tasksDone: 2,
        tasksRemaining: 1,
        todayNetXp: 100,
        xpAtRisk: 50,
        rank: null,
        totalXp: 100,
      }),
    ).toBe(true);
  });
});
