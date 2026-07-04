import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  BUDDY_SUMMARY_KIND,
  getBuddySummarySubjectSkipReason,
  isBuddySummaryRecipientDormant,
  isBuddySummarySlotDue,
} from '../utils/buddy-summary-eligibility';
import {
  getWeeklyRecapLogDate,
  getWeeklyRecapTimezone,
  isWeeklyRecapSundaySweepDue,
} from '../utils/weekly-recap-eligibility';
import {
  computeWeeklyRecapRollup,
  computeWeeklyRecapRollupRange,
} from '../utils/weekly-recap-rollup';
import { EvolutionApiClient } from '../whatsapp/evolution.client';
import { BuddySummaryMessageService } from '../whatsapp/buddy-summary-message.service';
import { WeeklyRecapService } from './weekly-recap.service';

type PairUser = {
  id: string;
  name: string;
  phone: string | null;
  whatsappOptIn: boolean;
  timezone: string;
  groupId: string | null;
  group: { challengeTimezone: string | null } | null;
};

type Delivery = {
  recipient: PairUser;
  subject: PairUser;
  recipientTimezone: string;
  subjectTimezone: string;
};

/**
 * Sends opt-in accountability buddy summaries (#178) each Sunday, sharing the
 * recap cadence window (~10:00 local) and its batched loaders — no N+1.
 *
 * Precedence: uses its own ReminderLog kind (BUDDY_SUMMARY) with ISO-week
 * dedupe, so it never collides with WEEKLY_RECAP / MORNING / EVENING on the
 * unique (userId, date, kind) key. Like the recap it defers to win-back — a
 * dormant *recipient* gets a win-back instead, and a dormant *partner* is never
 * summarized (supportive, not surveillance).
 */
@Injectable()
export class BuddySummaryService {
  private readonly logger = new Logger(BuddySummaryService.name);
  private loggedUnconfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionApiClient,
    private readonly buddyMessage: BuddySummaryMessageService,
    private readonly recapService: WeeklyRecapService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processBuddySummaries(): Promise<void> {
    if (!this.evolution.isConfigured()) {
      if (!this.loggedUnconfigured) {
        this.logger.debug(
          'Evolution API not configured — skipping WhatsApp buddy summaries',
        );
        this.loggedUnconfigured = true;
      }
      return;
    }

    const pairs = await this.prisma.accountabilityPair.findMany({
      where: { status: 'ACTIVE' },
      select: {
        groupId: true,
        requester: { select: pairUserSelect },
        addressee: { select: pairUserSelect },
      },
    });

    if (pairs.length === 0) {
      return;
    }

    const now = new Date();
    const deliveries: Delivery[] = [];
    for (const pair of pairs) {
      const members: Array<[PairUser, PairUser]> = [
        [pair.requester, pair.addressee],
        [pair.addressee, pair.requester],
      ];
      for (const [recipient, subject] of members) {
        // A member who left the group is no longer paired here.
        if (
          recipient.groupId !== pair.groupId ||
          subject.groupId !== pair.groupId
        ) {
          continue;
        }
        if (!recipient.phone || !recipient.whatsappOptIn) {
          continue;
        }
        const recipientTimezone = getWeeklyRecapTimezone({
          timezone: recipient.timezone,
          challengeTimezone: recipient.group?.challengeTimezone,
        });
        if (!isWeeklyRecapSundaySweepDue(recipientTimezone, now)) {
          continue;
        }
        deliveries.push({
          recipient,
          subject,
          recipientTimezone,
          subjectTimezone: getWeeklyRecapTimezone({
            timezone: subject.timezone,
            challengeTimezone: subject.group?.challengeTimezone,
          }),
        });
      }
    }

    if (deliveries.length === 0) {
      return;
    }

    // One batch load for every recipient + subject (reuses recap loaders).
    const candidateById = new Map<
      string,
      { id: string; challengeTimezone: string }
    >();
    for (const delivery of deliveries) {
      candidateById.set(delivery.recipient.id, {
        id: delivery.recipient.id,
        challengeTimezone: delivery.recipientTimezone,
      });
      candidateById.set(delivery.subject.id, {
        id: delivery.subject.id,
        challengeTimezone: delivery.subjectTimezone,
      });
    }

    const batch = await this.recapService.loadBatchContext([
      ...candidateById.values(),
    ]);

    const recipientIds = [
      ...new Set(deliveries.map((delivery) => delivery.recipient.id)),
    ];
    const logDateByRecipient = new Map(
      deliveries.map((delivery) => [
        delivery.recipient.id,
        getWeeklyRecapLogDate(delivery.recipientTimezone, now),
      ]),
    );
    const uniqueLogDates = [
      ...new Set(
        [...logDateByRecipient.values()].map((date) => date.getTime()),
      ),
    ].map((time) => new Date(time));

    const buddyLogs =
      uniqueLogDates.length > 0
        ? await this.prisma.reminderLog.findMany({
            where: {
              userId: { in: recipientIds },
              kind: BUDDY_SUMMARY_KIND,
              date: { in: uniqueLogDates },
            },
            select: { userId: true, date: true, status: true },
          })
        : [];

    for (const delivery of deliveries) {
      try {
        await this.processDelivery(delivery, batch, buddyLogs, now);
      } catch (error) {
        this.logger.error(
          `Buddy summary failed for recipient ${delivery.recipient.id}:`,
          error,
        );
      }
    }
  }

  private async processDelivery(
    delivery: Delivery,
    batch: Awaited<ReturnType<WeeklyRecapService['loadBatchContext']>>,
    buddyLogs: Array<{ userId: string; date: Date; status: string }>,
    now: Date,
  ): Promise<void> {
    const { recipient, subject, recipientTimezone, subjectTimezone } = delivery;

    const logDate = getWeeklyRecapLogDate(recipientTimezone, now);
    const existingLog =
      buddyLogs.find(
        (log) =>
          log.userId === recipient.id &&
          log.date.getTime() === logDate.getTime(),
      ) ?? null;

    if (
      !isBuddySummarySlotDue({
        timezone: recipientTimezone,
        logThisWeek: existingLog,
        now,
      })
    ) {
      return;
    }

    // Dormant recipients belong to win-back, not a cheerful buddy ping.
    const recipientChallenge = batch.challengeByUser.get(recipient.id) ?? null;
    if (
      isBuddySummaryRecipientDormant({
        challenge: recipientChallenge,
        challengeTimezone: recipientTimezone,
        lastActivityDate: recipientChallenge
          ? (batch.lastActivityByChallenge.get(recipientChallenge.id) ?? null)
          : null,
        lastWinbackSentAt: batch.lastWinbackByUser.get(recipient.id) ?? null,
        now,
      })
    ) {
      return;
    }

    const subjectChallenge = batch.challengeByUser.get(subject.id) ?? null;
    if (!subjectChallenge) {
      return;
    }

    const subjectDayScores =
      batch.dayScoresByChallenge.get(subjectChallenge.id) ?? [];
    const rollupRange = computeWeeklyRecapRollupRange(
      subjectChallenge,
      subjectTimezone,
      subjectDayScores,
      now,
    );

    const subjectSkip = getBuddySummarySubjectSkipReason({
      challenge: subjectChallenge,
      challengeTimezone: subjectTimezone,
      lastActivityDate:
        batch.lastActivityByChallenge.get(subjectChallenge.id) ?? null,
      lastWinbackSentAt: batch.lastWinbackByUser.get(subject.id) ?? null,
      activityDatesInWeek: (
        batch.activityDatesByChallenge.get(subjectChallenge.id) ?? []
      ).filter(
        (dateKey) =>
          dateKey >= rollupRange.eligibleStartKey &&
          dateKey <= rollupRange.eligibleEndKey,
      ),
      eligibleRange: rollupRange,
      now,
    });

    if (subjectSkip) {
      return;
    }

    const activityNames =
      (subject.groupId
        ? batch.activityNamesByGroup.get(subject.groupId)
        : null) ?? new Map<string, string>();

    const rollup = computeWeeklyRecapRollup({
      challenge: subjectChallenge,
      timezone: subjectTimezone,
      dayScores: subjectDayScores,
      activityLogs:
        batch.activityLogsByChallenge.get(subjectChallenge.id) ?? [],
      activityNames,
      now,
    });

    await this.buddyMessage.trySendBuddySummary({
      prisma: this.prisma,
      recipientId: recipient.id,
      phone: recipient.phone!,
      logDate,
      context: {
        recipientName: recipient.name,
        partnerName: subject.name,
        rollup,
      },
    });
  }
}

const pairUserSelect = {
  id: true,
  name: true,
  phone: true,
  whatsappOptIn: true,
  timezone: true,
  groupId: true,
  group: { select: { challengeTimezone: true } },
} as const;
