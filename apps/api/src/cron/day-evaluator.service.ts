import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiVerdict, TaskType } from '@workspace-starter/db';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_TASK_TYPES, isTaskLogValid } from '../services/tasks.service';
import { addLocalDays, getUserLocalDate } from '../utils/day-window';

@Injectable()
export class DayEvaluatorService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateDays() {
    const users = await this.prisma.user.findMany({
      where: {
        attempts: { some: { isActive: true } },
      },
      include: {
        attempts: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    for (const user of users) {
      const attempt = user.attempts[0];
      if (!attempt) continue;

      try {
        await this.evaluateUserDay(user.id, user.timezone, attempt);
      } catch (error) {
        console.error(`Day evaluation failed for user ${user.id}:`, error);
      }
    }
  }

  private async evaluateUserDay(
    userId: string,
    timezone: string,
    attempt: {
      id: string;
      attemptNumber: number;
      startDate: Date;
      currentDay: number;
      longestStreak: number;
      timesRestarted: number;
    },
  ) {
    const localToday = getUserLocalDate(timezone);
    const previousDay = addLocalDays(localToday, -1, timezone);
    const attemptStartDay = getUserLocalDate(timezone, attempt.startDate);

    if (previousDay.getTime() < attemptStartDay.getTime()) {
      return;
    }

    const existingResult = await this.prisma.dayResult.findFirst({
      where: {
        attemptId: attempt.id,
        date: previousDay,
      },
    });

    if (existingResult) {
      return;
    }

    const taskLogs = await this.prisma.taskLog.findMany({
      where: {
        attemptId: attempt.id,
        userId,
        date: previousDay,
      },
    });

    const logsByType = new Map(taskLogs.map((log) => [log.taskType, log]));
    const allTasksPresent = ALL_TASK_TYPES.every((type) =>
      logsByType.has(type),
    );
    const allTasksValid =
      allTasksPresent &&
      ALL_TASK_TYPES.every((type) => {
        const log = logsByType.get(type)!;
        return isTaskLogValid(log);
      });

    if (allTasksValid) {
      await this.handleSuccessfulDay(attempt, previousDay);
      return;
    }

    await this.handleFailedDay(
      userId,
      attempt,
      previousDay,
      allTasksPresent,
      logsByType,
    );
  }

  private async handleSuccessfulDay(
    attempt: {
      id: string;
      currentDay: number;
      longestStreak: number;
    },
    date: Date,
  ) {
    const newDay = attempt.currentDay + 1;
    const newLongestStreak = Math.max(
      attempt.longestStreak,
      attempt.currentDay,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.dayResult.create({
        data: {
          attemptId: attempt.id,
          date,
          dayNumber: attempt.currentDay,
          completed: true,
        },
      });

      if (newDay > 75) {
        await tx.attempt.update({
          where: { id: attempt.id },
          data: {
            currentDay: 76,
            longestStreak: newLongestStreak,
            endDate: new Date(),
          },
        });
      } else {
        await tx.attempt.update({
          where: { id: attempt.id },
          data: {
            currentDay: newDay,
            longestStreak: newLongestStreak,
          },
        });
      }
    });
  }

  private async handleFailedDay(
    userId: string,
    attempt: {
      id: string;
      attemptNumber: number;
      currentDay: number;
      timesRestarted: number;
    },
    date: Date,
    allTasksPresent: boolean,
    logsByType: Map<
      TaskType,
      {
        taskType: TaskType;
        isValid: boolean;
        aiVerdict: AiVerdict | null;
        completedAt: Date | null;
      }
    >,
  ) {
    const failReason = this.buildFailReason(allTasksPresent, logsByType);

    await this.prisma.$transaction(async (tx) => {
      await tx.dayResult.create({
        data: {
          attemptId: attempt.id,
          date,
          dayNumber: attempt.currentDay,
          completed: false,
          failedAt: new Date(),
          failReason,
        },
      });

      await tx.attempt.update({
        where: { id: attempt.id },
        data: {
          isActive: false,
          endDate: new Date(),
        },
      });

      await tx.attempt.create({
        data: {
          userId,
          attemptNumber: attempt.attemptNumber + 1,
          startDate: new Date(),
          currentDay: 1,
          isActive: true,
          longestStreak: 0,
          timesRestarted: attempt.timesRestarted + 1,
        },
      });
    });
  }

  private buildFailReason(
    allTasksPresent: boolean,
    logsByType: Map<
      TaskType,
      {
        taskType: TaskType;
        isValid: boolean;
        aiVerdict: AiVerdict | null;
        completedAt: Date | null;
      }
    >,
  ): string {
    if (!allTasksPresent) {
      const missing = ALL_TASK_TYPES.filter((type) => !logsByType.has(type));
      return `Missing tasks: ${missing.join(', ')}`;
    }

    const invalid = ALL_TASK_TYPES.filter((type) => {
      const log = logsByType.get(type);
      return !log || !isTaskLogValid(log);
    });

    return `Invalid or incomplete tasks: ${invalid.join(', ')}`;
  }
}
