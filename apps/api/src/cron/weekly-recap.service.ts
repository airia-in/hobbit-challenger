import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { challengeDisplayOrderBy } from '../utils/challenge-query';
import { formatLocalDateKey, parseLocalDateKey } from '../utils/day-window';
import { WINBACK_KIND } from '../utils/winback-dormancy';
import {
  computeWeeklyRecapRollup,
  computeWeeklyRecapRollupRange,
  type WeeklyRecapRollup,
} from '../utils/weekly-recap-rollup';
import {
  getWeeklyRecapLogDate,
  getWeeklyRecapSkipReason,
  getWeeklyRecapTimezone,
  getWeeklyRecapWeekKeys,
  isWeeklyRecapSlotDue,
  isWeeklyRecapSundaySweepDue,
  WEEKLY_RECAP_KIND,
} from '../utils/weekly-recap-eligibility';
import { EvolutionApiClient } from '../whatsapp/evolution.client';
import { WeeklyRecapMessageService } from '../whatsapp/weekly-recap-message.service';

type ChallengeRow = {
  id: string;
  userId: string;
  startDate: Date;
  endDate: Date | null;
  lengthDays: number;
  currentDay: number;
  isActive: boolean;
  stoppedAt: Date | null;
};

type RecapCandidate = {
  id: string;
  name: string;
  phone: string;
  weeklyRecapOptIn: boolean;
  whatsappOptIn: boolean;
  challengeTimezone: string;
  groupId: string | null;
  challenge: ChallengeRow;
};

type DayScoreRow = {
  date: Date;
  netXp: number;
  breakdown: unknown;
  finalized: boolean;
};

type ActivityLogRow = {
  activityId: string;
  date: Date;
  state: string | null;
  tier: string | null;
  value: number | null;
  subPoints: unknown;
};

export type WeeklyRecapBatchContext = {
  challengeByUser: Map<string, ChallengeRow>;
  lastActivityByChallenge: Map<string, Date | null>;
  lastWinbackByUser: Map<string, Date>;
  recapLogByUser: Map<string, { status: string } | null>;
  activityDatesByChallenge: Map<string, string[]>;
  dayScoresByChallenge: Map<string, DayScoreRow[]>;
  activityLogsByChallenge: Map<string, ActivityLogRow[]>;
  activityNamesByGroup: Map<string, Map<string, string>>;
};

@Injectable()
export class WeeklyRecapService {
  private readonly logger = new Logger(WeeklyRecapService.name);
  private loggedUnconfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionApiClient,
    private readonly weeklyRecapMessage: WeeklyRecapMessageService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processWeeklyRecaps(): Promise<void> {
    if (!this.evolution.isConfigured()) {
      if (!this.loggedUnconfigured) {
        this.logger.debug(
          'Evolution API not configured — skipping WhatsApp weekly recaps',
        );
        this.loggedUnconfigured = true;
      }
      return;
    }

    const users = await this.prisma.user.findMany({
      where: {
        phone: { not: null },
        whatsappOptIn: true,
        weeklyRecapOptIn: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        weeklyRecapOptIn: true,
        whatsappOptIn: true,
        groupId: true,
        timezone: true,
        group: { select: { challengeTimezone: true } },
      },
    });

    if (users.length === 0) {
      return;
    }

    const now = new Date();
    const windowCandidates = users.flatMap((user) => {
      if (!user.phone) {
        return [];
      }
      const recapTimezone = getWeeklyRecapTimezone({
        timezone: user.timezone,
        challengeTimezone: user.group?.challengeTimezone,
      });
      if (!isWeeklyRecapSundaySweepDue(recapTimezone, now)) {
        return [];
      }
      return [
        {
          id: user.id,
          name: user.name,
          phone: user.phone,
          weeklyRecapOptIn: user.weeklyRecapOptIn,
          whatsappOptIn: user.whatsappOptIn,
          groupId: user.groupId,
          recapTimezone,
        },
      ];
    });

    if (windowCandidates.length === 0) {
      return;
    }

    const batch = await this.loadBatchContext(
      windowCandidates.map((candidate) => ({
        id: candidate.id,
        challengeTimezone: candidate.recapTimezone,
      })),
    );

    for (const candidate of windowCandidates) {
      const challenge = batch.challengeByUser.get(candidate.id);
      if (!challenge) {
        continue;
      }

      try {
        await this.processCandidate(
          {
            id: candidate.id,
            name: candidate.name,
            phone: candidate.phone,
            weeklyRecapOptIn: candidate.weeklyRecapOptIn,
            whatsappOptIn: candidate.whatsappOptIn,
            challengeTimezone: candidate.recapTimezone,
            groupId: candidate.groupId,
            challenge,
          },
          batch,
        );
      } catch (error) {
        this.logger.error(
          `Weekly recap failed for user ${candidate.id}:`,
          error,
        );
      }
    }
  }

  async loadBatchContext(
    candidates: Array<{ id: string; challengeTimezone: string }>,
  ): Promise<WeeklyRecapBatchContext> {
    const empty: WeeklyRecapBatchContext = {
      challengeByUser: new Map(),
      lastActivityByChallenge: new Map(),
      lastWinbackByUser: new Map(),
      recapLogByUser: new Map(),
      activityDatesByChallenge: new Map(),
      dayScoresByChallenge: new Map(),
      activityLogsByChallenge: new Map(),
      activityNamesByGroup: new Map(),
    };

    if (candidates.length === 0) {
      return empty;
    }

    const userIds = candidates.map((candidate) => candidate.id);
    const logDateByUser = new Map(
      candidates.map((candidate) => [
        candidate.id,
        getWeeklyRecapLogDate(candidate.challengeTimezone),
      ]),
    );
    const uniqueLogDates = [
      ...new Set([...logDateByUser.values()].map((date) => date.getTime())),
    ].map((time) => new Date(time));

    const weekKeysByUser = new Map(
      candidates.map((candidate) => [
        candidate.id,
        getWeeklyRecapWeekKeys(candidate.challengeTimezone),
      ]),
    );

    const challenges = await this.prisma.challenge.findMany({
      where: { userId: { in: userIds } },
      orderBy: challengeDisplayOrderBy,
    });

    const challengeByUser = new Map<string, ChallengeRow>();
    for (const challenge of challenges) {
      if (!challengeByUser.has(challenge.userId)) {
        challengeByUser.set(challenge.userId, challenge);
      }
    }

    const challengeIds = [...challengeByUser.values()].map(
      (challenge) => challenge.id,
    );

    let minWeekStartKey = '9999-99-99';
    for (const candidate of candidates) {
      const { weekStartKey } = getWeeklyRecapWeekKeys(
        candidate.challengeTimezone,
      );
      if (weekStartKey < minWeekStartKey) {
        minWeekStartKey = weekStartKey;
      }
    }
    const rollupWindowStart = parseLocalDateKey(minWeekStartKey, 'UTC');

    const usersWithGroups = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, groupId: true },
    });
    const groupIds = [
      ...new Set(
        usersWithGroups
          .map((user) => user.groupId)
          .filter((id): id is string => id != null),
      ),
    ];

    const [
      lastLogs,
      winbackSentLogs,
      recapLogs,
      activityLogs,
      dayScores,
      activities,
    ] = await Promise.all([
      challengeIds.length > 0
        ? this.prisma.activityLog.groupBy({
            by: ['challengeId'],
            where: { challengeId: { in: challengeIds } },
            _max: { date: true },
          })
        : Promise.resolve([]),
      this.prisma.reminderLog.findMany({
        where: {
          userId: { in: userIds },
          kind: WINBACK_KIND,
          status: 'SENT',
        },
        orderBy: { sentAt: 'desc' },
        select: { userId: true, sentAt: true },
      }),
      uniqueLogDates.length > 0
        ? this.prisma.reminderLog.findMany({
            where: {
              userId: { in: userIds },
              kind: WEEKLY_RECAP_KIND,
              date: { in: uniqueLogDates },
            },
            select: { userId: true, date: true, status: true },
          })
        : Promise.resolve([]),
      challengeIds.length > 0
        ? this.prisma.activityLog.findMany({
            where: {
              challengeId: { in: challengeIds },
              date: { gte: rollupWindowStart },
            },
            select: {
              challengeId: true,
              activityId: true,
              date: true,
              state: true,
              tier: true,
              value: true,
              subPoints: true,
            },
          })
        : Promise.resolve([]),
      challengeIds.length > 0
        ? this.prisma.dayScore.findMany({
            where: {
              challengeId: { in: challengeIds },
              date: { gte: rollupWindowStart },
            },
            select: {
              challengeId: true,
              date: true,
              netXp: true,
              breakdown: true,
              finalized: true,
            },
          })
        : Promise.resolve([]),
      groupIds.length > 0
        ? this.prisma.activity.findMany({
            where: { groupId: { in: groupIds }, isPersonal: false },
            select: { id: true, name: true, groupId: true },
          })
        : Promise.resolve([]),
    ]);

    const lastActivityByChallenge = new Map(
      lastLogs.map((row) => [row.challengeId, row._max.date]),
    );

    const lastWinbackByUser = new Map<string, Date>();
    for (const log of winbackSentLogs) {
      if (!lastWinbackByUser.has(log.userId)) {
        lastWinbackByUser.set(log.userId, log.sentAt);
      }
    }

    const recapLogByUser = new Map<string, { status: string } | null>();
    for (const candidate of candidates) {
      const logDate = logDateByUser.get(candidate.id)!;
      const log = recapLogs.find(
        (row) =>
          row.userId === candidate.id &&
          row.date.getTime() === logDate.getTime(),
      );
      recapLogByUser.set(candidate.id, log ?? null);
    }

    const activityNamesByGroup = new Map<string, Map<string, string>>();
    for (const activity of activities) {
      if (!activity.groupId) continue;
      const names =
        activityNamesByGroup.get(activity.groupId) ?? new Map<string, string>();
      names.set(activity.id, activity.name);
      activityNamesByGroup.set(activity.groupId, names);
    }

    const activityDatesByChallenge = new Map<string, string[]>();
    const activityLogsByChallenge = new Map<string, ActivityLogRow[]>();

    for (const candidate of candidates) {
      const challenge = challengeByUser.get(candidate.id);
      if (!challenge) continue;

      const weekKeys = weekKeysByUser.get(candidate.id)!;
      const timezone = candidate.challengeTimezone;

      const filteredLogs = activityLogs
        .filter((log) => log.challengeId === challenge.id)
        .filter((log) => {
          const dateKey = formatLocalDateKey(log.date, timezone);
          return (
            dateKey >= weekKeys.weekStartKey && dateKey <= weekKeys.weekEndKey
          );
        })
        .map((log) => ({
          activityId: log.activityId,
          date: log.date,
          state: log.state,
          tier: log.tier,
          value: log.value,
          subPoints: log.subPoints,
        }));

      activityLogsByChallenge.set(challenge.id, filteredLogs);
      activityDatesByChallenge.set(challenge.id, [
        ...new Set(
          filteredLogs.map((log) => formatLocalDateKey(log.date, timezone)),
        ),
      ]);
    }

    const dayScoresByChallenge = new Map<string, DayScoreRow[]>();
    for (const score of dayScores) {
      const rows = dayScoresByChallenge.get(score.challengeId) ?? [];
      rows.push({
        date: score.date,
        netXp: score.netXp,
        breakdown: score.breakdown,
        finalized: score.finalized,
      });
      dayScoresByChallenge.set(score.challengeId, rows);
    }

    return {
      challengeByUser,
      lastActivityByChallenge,
      lastWinbackByUser,
      recapLogByUser,
      activityDatesByChallenge,
      dayScoresByChallenge,
      activityLogsByChallenge,
      activityNamesByGroup,
    };
  }

  private async processCandidate(
    candidate: RecapCandidate,
    batch: WeeklyRecapBatchContext,
  ): Promise<void> {
    const recapLog = batch.recapLogByUser.get(candidate.id) ?? null;

    if (
      !isWeeklyRecapSlotDue({
        timezone: candidate.challengeTimezone,
        recapLogThisWeek: recapLog,
      })
    ) {
      return;
    }

    const dayScores =
      batch.dayScoresByChallenge.get(candidate.challenge.id) ?? [];
    const rollupRange = computeWeeklyRecapRollupRange(
      candidate.challenge,
      candidate.challengeTimezone,
      dayScores,
    );

    const skipReason = getWeeklyRecapSkipReason({
      challenge: candidate.challenge,
      challengeTimezone: candidate.challengeTimezone,
      lastActivityDate:
        batch.lastActivityByChallenge.get(candidate.challenge.id) ?? null,
      lastWinbackSentAt: batch.lastWinbackByUser.get(candidate.id) ?? null,
      activityDatesInWeek: (
        batch.activityDatesByChallenge.get(candidate.challenge.id) ?? []
      ).filter(
        (dateKey) =>
          dateKey >= rollupRange.eligibleStartKey &&
          dateKey <= rollupRange.eligibleEndKey,
      ),
      weeklyRecapOptIn: candidate.weeklyRecapOptIn,
      whatsappOptIn: candidate.whatsappOptIn,
      hasPhone: true,
      eligibleRange: rollupRange,
    });

    if (skipReason) {
      return;
    }

    const logDate = getWeeklyRecapLogDate(candidate.challengeTimezone);
    const activityNames =
      (candidate.groupId
        ? batch.activityNamesByGroup.get(candidate.groupId)
        : null) ?? new Map<string, string>();

    const rollup = computeWeeklyRecapRollup({
      challenge: candidate.challenge,
      timezone: candidate.challengeTimezone,
      dayScores,
      activityLogs:
        batch.activityLogsByChallenge.get(candidate.challenge.id) ?? [],
      activityNames,
    });

    await this.weeklyRecapMessage.trySendWeeklyRecap({
      prisma: this.prisma,
      userId: candidate.id,
      phone: candidate.phone,
      logDate,
      context: {
        name: candidate.name,
        rollup,
      },
    });
  }
}

export type { WeeklyRecapRollup };
