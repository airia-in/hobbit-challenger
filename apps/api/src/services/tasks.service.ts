import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { AiVerdict, TaskType } from '@workspace-starter/db';
import type { PrismaService } from '../prisma/prisma.service';
import {
  getUserLocalDate,
  isBeforeMidnight,
  isSameLocalDay,
} from '../utils/day-window';
import { ProofVerifierService } from './proof-verifier.service';

export type TaskStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'REJECTED';

export type TodayTask = {
  taskType: TaskType;
  title: string;
  icon: string;
  status: TaskStatus;
  taskLogId: string | null;
  proofUrl: string | null;
  proofNotes: string | null;
  bookTitle: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  dietConfirmed: boolean;
  aiVerdict: AiVerdict | null;
  aiReason: string | null;
  completedAt: Date | null;
  canEdit: boolean;
};

export type SubmitTaskInput = {
  taskType: TaskType;
  proofUrl?: string;
  proofNotes?: string;
  bookTitle?: string;
  pageFrom?: number;
  pageTo?: number;
  dietConfirmed?: boolean;
};

export type UpdateProofInput = {
  proofUrl?: string;
  proofNotes?: string;
  bookTitle?: string;
  pageFrom?: number;
  pageTo?: number;
  dietConfirmed?: boolean;
};

const TASK_DEFINITIONS: Array<{
  taskType: TaskType;
  title: string;
  icon: string;
}> = [
  { taskType: TaskType.DIET, title: 'Follow Your Diet', icon: '🥗' },
  { taskType: TaskType.OUTDOOR_WORKOUT, title: 'Outdoor Workout (45 min)', icon: '🌳' },
  { taskType: TaskType.INDOOR_WORKOUT, title: 'Indoor Workout (45 min)', icon: '💪' },
  { taskType: TaskType.WATER, title: 'Drink 1 Gallon of Water', icon: '💧' },
  { taskType: TaskType.READING, title: 'Read 10 Pages (non-fiction)', icon: '📖' },
  { taskType: TaskType.PROGRESS_PHOTO, title: 'Progress Photo', icon: '📸' },
];

const PHOTO_TASKS = new Set<TaskType>([
  TaskType.OUTDOOR_WORKOUT,
  TaskType.INDOOR_WORKOUT,
  TaskType.WATER,
  TaskType.PROGRESS_PHOTO,
]);

function resolveTaskStatus(
  log: {
    completedAt: Date | null;
    isValid: boolean;
    aiVerdict: AiVerdict | null;
  } | null,
  canSubmit: boolean,
): TaskStatus {
  if (!log?.completedAt) {
    return canSubmit ? 'PENDING' : 'OVERDUE';
  }

  if (!log.isValid || log.aiVerdict === AiVerdict.FAILED) {
    return 'REJECTED';
  }

  return 'COMPLETED';
}

function validateTaskInput(
  taskType: TaskType,
  input: SubmitTaskInput | UpdateProofInput,
): { isValid: boolean; reason?: string } {
  if (taskType === TaskType.READING) {
    if (!input.bookTitle?.trim()) {
      return { isValid: false, reason: 'Book title is required' };
    }
    const from = input.pageFrom ?? 0;
    const to = input.pageTo ?? 0;
    if (to - from < 10) {
      return { isValid: false, reason: 'You must read at least 10 pages' };
    }
    return { isValid: true };
  }

  if (taskType === TaskType.DIET) {
    if (!input.dietConfirmed) {
      return { isValid: false, reason: 'You must confirm you followed your diet' };
    }
    return { isValid: true };
  }

  if (PHOTO_TASKS.has(taskType) && !input.proofUrl) {
    return { isValid: false, reason: 'Photo proof is required' };
  }

  return { isValid: true };
}

function needsAiVerification(
  taskType: TaskType,
  proofUrl?: string | null,
): boolean {
  if (PHOTO_TASKS.has(taskType)) {
    return Boolean(proofUrl);
  }

  if (taskType === TaskType.DIET) {
    return Boolean(proofUrl);
  }

  return false;
}

function mapVerificationToVerdict(result: {
  passed: boolean;
  confidence: number;
  reason: string;
}): {
  aiVerdict: AiVerdict;
  aiConfidence: number;
  aiReason: string;
  isValid: boolean;
} {
  if (result.reason === 'SKIPPED') {
    return {
      aiVerdict: AiVerdict.SKIPPED,
      aiConfidence: result.confidence,
      aiReason: result.reason,
      isValid: true,
    };
  }

  if (result.passed) {
    return {
      aiVerdict: AiVerdict.PASSED,
      aiConfidence: result.confidence,
      aiReason: result.reason,
      isValid: true,
    };
  }

  return {
    aiVerdict: AiVerdict.FAILED,
    aiConfidence: result.confidence,
    aiReason: result.reason,
    isValid: false,
  };
}

async function getActiveAttempt(prisma: PrismaService, userId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: { userId, isActive: true },
  });

  if (!attempt) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No active challenge attempt found',
    });
  }

  return attempt;
}

@Injectable()
export class TasksService {
  constructor(private readonly proofVerifier: ProofVerifierService) {}

  async getTodayTasks(
    prisma: PrismaService,
    userId: string,
  ): Promise<{
    currentDay: number;
    date: Date;
    canSubmit: boolean;
    tasks: TodayTask[];
  }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const attempt = await getActiveAttempt(prisma, userId);
    const todayDate = getUserLocalDate(user.timezone);
    const canSubmit = isBeforeMidnight(user.timezone);

    const logs = await prisma.taskLog.findMany({
      where: {
        userId,
        attemptId: attempt.id,
        date: todayDate,
      },
    });

    const logByType = new Map(logs.map((log) => [log.taskType, log]));

    const tasks = TASK_DEFINITIONS.map((definition) => {
      const log = logByType.get(definition.taskType) ?? null;
      return {
        taskType: definition.taskType,
        title: definition.title,
        icon: definition.icon,
        status: resolveTaskStatus(log, canSubmit),
        taskLogId: log?.id ?? null,
        proofUrl: log?.proofUrl ?? null,
        proofNotes: log?.proofNotes ?? null,
        bookTitle: log?.bookTitle ?? null,
        pageFrom: log?.pageFrom ?? null,
        pageTo: log?.pageTo ?? null,
        dietConfirmed: log?.dietConfirmed ?? false,
        aiVerdict: log?.aiVerdict ?? null,
        aiReason: log?.aiReason ?? null,
        completedAt: log?.completedAt ?? null,
        canEdit: canSubmit && Boolean(log),
      };
    });

    return {
      currentDay: attempt.currentDay,
      date: todayDate,
      canSubmit,
      tasks,
    };
  }

  async submitTask(
    prisma: PrismaService,
    userId: string,
    input: SubmitTaskInput,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    if (!isBeforeMidnight(user.timezone)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Submissions are locked after midnight',
      });
    }

    const attempt = await getActiveAttempt(prisma, userId);
    const todayDate = getUserLocalDate(user.timezone);

    const existing = await prisma.taskLog.findFirst({
      where: {
        attemptId: attempt.id,
        taskType: input.taskType,
        date: todayDate,
      },
    });

    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Task already submitted for today. Use updateProof to edit.',
      });
    }

    const validation = validateTaskInput(input.taskType, input);
    if (!validation.isValid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: validation.reason ?? 'Invalid task submission',
      });
    }

    const aiFields = await this.runVerification(input.taskType, input.proofUrl);

    const taskLog = await prisma.taskLog.create({
      data: {
        attemptId: attempt.id,
        userId,
        taskType: input.taskType,
        date: todayDate,
        completedAt: new Date(),
        proofUrl: input.proofUrl,
        proofNotes: input.proofNotes,
        bookTitle: input.bookTitle,
        pageFrom: input.pageFrom,
        pageTo: input.pageTo,
        dietConfirmed: input.dietConfirmed ?? false,
        ...aiFields,
      },
    });

    return taskLog;
  }

  async updateProof(
    prisma: PrismaService,
    userId: string,
    taskLogId: string,
    input: UpdateProofInput,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    if (!isBeforeMidnight(user.timezone)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Proof can only be updated before midnight',
      });
    }

    const taskLog = await prisma.taskLog.findFirst({
      where: { id: taskLogId, userId },
    });

    if (!taskLog) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Task log not found' });
    }

    const todayDate = getUserLocalDate(user.timezone);
    if (!isSameLocalDay(taskLog.date, todayDate, user.timezone)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Can only update proof for today',
      });
    }

    const merged = {
      proofUrl: input.proofUrl ?? taskLog.proofUrl ?? undefined,
      proofNotes: input.proofNotes ?? taskLog.proofNotes ?? undefined,
      bookTitle: input.bookTitle ?? taskLog.bookTitle ?? undefined,
      pageFrom: input.pageFrom ?? taskLog.pageFrom ?? undefined,
      pageTo: input.pageTo ?? taskLog.pageTo ?? undefined,
      dietConfirmed: input.dietConfirmed ?? taskLog.dietConfirmed,
    };

    const validation = validateTaskInput(taskLog.taskType, {
      taskType: taskLog.taskType,
      ...merged,
    });

    if (!validation.isValid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: validation.reason ?? 'Invalid proof update',
      });
    }

    const proofUrlChanged =
      input.proofUrl !== undefined && input.proofUrl !== taskLog.proofUrl;
    const shouldVerify =
      needsAiVerification(taskLog.taskType, merged.proofUrl) &&
      (proofUrlChanged || taskLog.aiVerdict === AiVerdict.FAILED);

    const aiFields = shouldVerify
      ? await this.runVerification(taskLog.taskType, merged.proofUrl)
      : {
          isValid: true,
          aiVerdict: taskLog.aiVerdict,
          aiConfidence: taskLog.aiConfidence,
          aiReason: taskLog.aiReason,
        };

    return prisma.taskLog.update({
      where: { id: taskLogId },
      data: {
        proofUrl: merged.proofUrl,
        proofNotes: merged.proofNotes,
        bookTitle: merged.bookTitle,
        pageFrom: merged.pageFrom,
        pageTo: merged.pageTo,
        dietConfirmed: merged.dietConfirmed,
        completedAt: new Date(),
        isValid: aiFields.isValid,
        aiVerdict: aiFields.aiVerdict,
        aiConfidence: aiFields.aiConfidence,
        aiReason: aiFields.aiReason,
      },
    });
  }

  private async runVerification(
    taskType: TaskType,
    proofUrl?: string | null,
  ): Promise<{
    isValid: boolean;
    aiVerdict: AiVerdict | null;
    aiConfidence: number | null;
    aiReason: string | null;
  }> {
    if (!needsAiVerification(taskType, proofUrl) || !proofUrl) {
      return {
        isValid: true,
        aiVerdict: null,
        aiConfidence: null,
        aiReason: null,
      };
    }

    const result = await this.proofVerifier.verifyProof(taskType, proofUrl);
    return mapVerificationToVerdict(result);
  }
}

export function isTaskLogValid(log: {
  isValid: boolean;
  aiVerdict: AiVerdict | null;
  completedAt: Date | null;
}): boolean {
  return Boolean(log.completedAt) && log.isValid && log.aiVerdict !== AiVerdict.FAILED;
}

export const ALL_TASK_TYPES = TASK_DEFINITIONS.map((task) => task.taskType);
