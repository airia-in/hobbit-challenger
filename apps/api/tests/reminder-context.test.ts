import { describe, expect, it } from 'vitest';
import type {
  GetTodayResult,
  TodayActivity,
} from '../src/services/activities.service';
import {
  buildReminderContextFromFixture,
  collectUnloggedHabitNames,
  computeXpAtRisk,
  countTasksFromToday,
  getChallengeYesterdayDate,
  hasEveningReminderEligibility,
  pickTopActivityStreak,
  resolveJourneyMilestone,
  STREAK_AT_RISK_MIN,
} from '../src/whatsapp/reminder-context.service';
import {
  addLocalDays,
  formatLocalDateKey,
  getUserLocalDate,
} from '../src/utils/day-window';

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
    allowsProof: false,
    autoCompleteOnProof: false,
    canEdit: true,
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

    expect(computeXpAtRisk(activities)).toBe(100);
  });

  it('picks top per-activity streak by count with first tie-break', () => {
    const activities = [
      scoredActivity({ id: 'a1', title: 'Water', currentStreak: 3 }),
      scoredActivity({ id: 'a2', title: 'Diet', currentStreak: 7 }),
      scoredActivity({ id: 'a3', title: 'Walk', currentStreak: 7 }),
    ];

    expect(pickTopActivityStreak(activities)).toEqual({
      topActivityStreak: 7,
      topActivityName: 'Diet',
    });
  });

  it('caps unlogged habit names at three scored activities', () => {
    const activities = [
      scoredActivity({ id: 'a1', title: 'One', log: null }),
      scoredActivity({ id: 'a2', title: 'Two', log: null }),
      scoredActivity({ id: 'a3', title: 'Three', log: null }),
      scoredActivity({ id: 'a4', title: 'Four', log: null }),
    ];

    expect(collectUnloggedHabitNames(activities)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  it('resolves journey milestone days', () => {
    expect(resolveJourneyMilestone(7)).toBe(7);
    expect(resolveJourneyMilestone(21)).toBe(21);
    expect(resolveJourneyMilestone(30)).toBe(30);
    expect(resolveJourneyMilestone(8)).toBeNull();
  });

  it('builds full context from fixture', () => {
    const today = emptyToday({
      currentDay: 7,
      scoredActivities: [
        scoredActivity({
          id: 'a1',
          title: 'Water',
          currentStreak: 5,
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
        scoredActivity({ id: 'a2', title: 'Diet', xpMiss: -200, log: null }),
        scoredActivity({ id: 'a3', title: 'Walk', log: null }),
      ],
    });

    const context = buildReminderContextFromFixture({
      name: 'Alex',
      today,
      todayNetXp: 50,
      totalXp: 1500,
      currentStreak: STREAK_AT_RISK_MIN,
      longestStreak: 12,
      rank: 2,
      missedYesterday: true,
    });

    expect(context).toEqual({
      name: 'Alex',
      dayNumber: 7,
      tasksDone: 1,
      tasksRemaining: 2,
      todayNetXp: 50,
      xpAtRisk: 150,
      rank: 2,
      totalXp: 1500,
      topActivityStreak: 5,
      topActivityName: 'Water',
      unloggedHabitNames: ['Diet', 'Walk'],
      missedYesterday: true,
      streakAtRisk: true,
      journeyMilestone: 7,
      currentStreak: STREAK_AT_RISK_MIN,
      longestStreak: 12,
    });
  });

  it('anchors challenge yesterday when user timezone lags challenge timezone', () => {
    const now = new Date('2026-06-10T18:00:00.000Z');
    const challengeTz = 'Asia/Tokyo';
    const userTz = 'America/Los_Angeles';

    const wrongYesterday = addLocalDays(
      getUserLocalDate(userTz, now),
      -1,
      challengeTz,
    );
    const correctYesterday = getChallengeYesterdayDate(challengeTz, now);

    expect(formatLocalDateKey(wrongYesterday, challengeTz)).toBe('2026-06-09');
    expect(formatLocalDateKey(correctYesterday, challengeTz)).toBe(
      '2026-06-10',
    );
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
        topActivityStreak: 0,
        topActivityName: null,
        unloggedHabitNames: [],
        missedYesterday: false,
        streakAtRisk: false,
        journeyMilestone: null,
        currentStreak: 0,
        longestStreak: 0,
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
        topActivityStreak: 0,
        topActivityName: null,
        unloggedHabitNames: [],
        missedYesterday: false,
        streakAtRisk: true,
        journeyMilestone: null,
        currentStreak: 5,
        longestStreak: 5,
      }),
    ).toBe(true);
  });
});
