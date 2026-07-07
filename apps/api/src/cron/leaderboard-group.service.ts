import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EvolutionApiClient } from '../whatsapp/evolution.client';
import {
  getLeaderboard,
  type LeaderboardSortBy,
} from '../services/leaderboard.service';
import { isLocalTimeMatch } from '../utils/day-window';

const DEFAULT_LEADERBOARD_TIME = '09:00';
const PODIUM_EMOJI = ['🥇', '🥈', '🥉'];

function formatSortedBy(sortBy: LeaderboardSortBy): string {
  switch (sortBy) {
    case 'streak':
      return 'streak';
    case 'successRate':
      return 'success rate';
    case 'name':
      return 'name';
    case 'day':
      return 'day progress';
    default:
      return 'XP';
  }
}

function formatLeaderboardText(
  groupName: string,
  podium: Array<{ rank: number; name: string; xp: number; streak: number }>,
  members: Array<{ rank: number; name: string; xp: number; streak: number }>,
  sortBy: LeaderboardSortBy,
): string {
  const sortLabel = formatSortedBy(sortBy);
  const lines = [
    `🐿️ *Hobbit Leaderboard — ${groupName}*`,
    `Ranked by ${sortLabel}:`,
    '',
  ];

  for (const member of podium) {
    const emoji = PODIUM_EMOJI[member.rank - 1] ?? '🏅';
    lines.push(
      `${emoji} ${member.name} — ${member.xp} XP · ${member.streak}d streak`,
    );
  }

  const rest = members.slice(3, 10);
  if (rest.length > 0) {
    lines.push('');
    for (const member of rest) {
      lines.push(
        `${member.rank}. ${member.name} — ${member.xp} XP · ${member.streak}d streak`,
      );
    }
  }

  return lines.join('\n');
}

@Injectable()
export class LeaderboardGroupService {
  private readonly logger = new Logger(LeaderboardGroupService.name);
  private loggedUnconfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionApiClient,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processLeaderboardGroups(): Promise<void> {
    if (!this.evolution.isConfigured()) {
      if (!this.loggedUnconfigured) {
        this.logger.debug(
          'Evolution API not configured — skipping leaderboard group messages',
        );
        this.loggedUnconfigured = true;
      }
      return;
    }

    const groups = await this.prisma.group.findMany({
      where: {
        whatsappGroupJid: { not: null },
      },
      select: {
        id: true,
        name: true,
        whatsappGroupJid: true,
        leaderboardTime: true,
        challengeTimezone: true,
        members: { select: { id: true } },
      },
    });

    for (const group of groups) {
      if (!group.whatsappGroupJid || group.members.length === 0) continue;

      try {
        const targetTime = group.leaderboardTime || DEFAULT_LEADERBOARD_TIME;
        const timezone = group.challengeTimezone || 'UTC';

        if (!isLocalTimeMatch(timezone, targetTime)) continue;

        await this.sendLeaderboardToGroup(
          group.id,
          group.name,
          group.whatsappGroupJid,
        );
      } catch (error) {
        this.logger.error(
          `Leaderboard group send failed for group ${group.id}:`,
          error,
        );
      }
    }
  }

  private async sendLeaderboardToGroup(
    groupId: string,
    groupName: string,
    groupJid: string,
  ): Promise<void> {
    const firstMember = await this.prisma.user.findFirst({
      where: { groupId },
      select: { id: true },
    });

    if (!firstMember) return;

    const now = new Date();
    const existing = await this.prisma.reminderLog.findUnique({
      where: {
        userId_date_kind: {
          userId: firstMember.id,
          date: now,
          kind: 'LEADERBOARD_GROUP',
        },
      },
    });

    if (existing?.status === 'SENT') return;

    const leaderboard = await getLeaderboard(
      this.prisma,
      firstMember.id,
      'today',
      'xp',
    );

    const text = formatLeaderboardText(
      groupName,
      leaderboard.podium.map((m) => ({
        rank: m.rank,
        name: m.name,
        xp: m.xp,
        streak: m.streak,
      })),
      leaderboard.members.map((m) => ({
        rank: m.rank,
        name: m.name,
        xp: m.xp,
        streak: m.streak,
      })),
      'xp',
    );

    const result = await this.evolution.sendText(groupJid, text);

    const status = result.ok ? 'SENT' : 'FAILED';
    await this.prisma.reminderLog.upsert({
      where: {
        userId_date_kind: {
          userId: firstMember.id,
          date: now,
          kind: 'LEADERBOARD_GROUP',
        },
      },
      create: {
        userId: firstMember.id,
        date: now,
        kind: 'LEADERBOARD_GROUP',
        status,
      },
      update: {
        status,
        sentAt: new Date(),
      },
    });

    if (result.ok) {
      this.logger.log(`Leaderboard sent to group ${groupName} (${groupJid})`);
    } else {
      this.logger.error(
        `Leaderboard failed for group ${groupName}: ${result.error}`,
      );
    }
  }
}
