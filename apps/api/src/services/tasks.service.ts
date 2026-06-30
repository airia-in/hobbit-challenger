import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';
import {
  getUserLocalDate,
  isBeforeMidnight,
  isSameLocalDay,
} from '../utils/day-window';
import { ProofVerifierService } from './proof-verifier.service';

export const LEGACY_TASK_TYPES = [
  'DIET',
  'OUTDOOR_WORKOUT',
  'INDOOR_WORKOUT',
  'WATER',
  'READING',
  'PROGRESS_PHOTO',
  'NO_REELS',
  'NO_SOCIAL',
] as const;

export type LegacyTaskType = (typeof LEGACY_TASK_TYPES)[number];

const TASK_TYPE_TO_SEED_KEY: Record<LegacyTaskType, string> = {
  DIET: 'DIET',
  OUTDOOR_WORKOUT: 'ACTIVITY',
  INDOOR_WORKOUT: 'ACTIVITY',
  WATER: 'WATER',
  READING: 'READING',
  PROGRESS_PHOTO: 'PROGRESS_PHOTO',
  NO_REELS: 'NO_REELS',
  NO_SOCIAL: 'NO_SOCIAL',
};

const SEED_KEY_TO_TASK_TYPE: Record<string, LegacyTaskType> = {
  DIET: 'DIET',
  ACTIVITY: 'OUTDOOR_WORKOUT',
  WATER: 'WATER',
  READING: 'READING',
  PROGRESS_PHOTO: 'PROGRESS_PHOTO',
  NO_REELS: 'NO_REELS',
  NO_SOCIAL: 'NO_SOCIAL',
};

function seedKeyToTaskType(seedKey: string | null): LegacyTaskType {
  if (seedKey && seedKey in SEED_KEY_TO_TASK_TYPE) {
    return SEED_KEY_TO_TASK_TYPE[seedKey]!;
  }

  return 'DIET';
}

export type TaskStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'REJECTED';

export type TodayTask = {
  taskType: LegacyTaskType;
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
  aiVerdict: string | null;
  aiReason: string | null;
  completedAt: Date | null;
  canEdit: boolean;
};

export type SubmitTaskInput = {
  taskType: LegacyTaskType;
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

const OPTIONAL_PHOTO_TASKS = new Set<LegacyTaskType>([
  'OUTDOOR_WORKOUT',
  'INDOOR_WORKOUT',
  'WATER',
]);

const PHOTO_TASKS = new Set<LegacyTaskType>([
  ...OPTIONAL_PHOTO_TASKS,
  'PROGRESS_PHOTO',
]);

function resolveTaskStatus(
  log: {
    state: string | null;
    aiVerdict: string | null;
  } | null,
  canSubmit: boolean,
): TaskStatus {
  if (!log?.state || log.state === 'UNLOGGED') {
    return canSubmit ? 'PENDING' : 'OVERDUE';
  }

  if (log.aiVerdict === 'FAILED' || log.state === 'FAILED') {
    return 'REJECTED';
  }

  return log.state === 'DONE' ? 'COMPLETED' : 'PENDING';
}

function validateTaskInput(
  taskType: LegacyTaskType,
  input: SubmitTaskInput | UpdateProofInput,
): { isValid: boolean; reason?: string } {
  if (taskType === 'READING') {
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

  if (taskType === 'DIET') {
    if (!input.dietConfirmed) {
      return {
        isValid: false,
        reason: 'You must confirm you followed your diet',
      };
    }
    return { isValid: true };
  }

  if (taskType === 'PROGRESS_PHOTO' && !input.proofUrl) {
    return { isValid: false, reason: 'Photo proof is required' };
  }

  return { isValid: true };
}

function needsAiVerification(
  taskType: LegacyTaskType,
  proofUrl?: string | null,
): boolean {
  if (PHOTO_TASKS.has(taskType)) {
    return Boolean(proofUrl);
  }

  return false;
}

function mapVerificationToVerdict(result: {
  passed: boolean;
  confidence: number;
  reason: string;
}): {
  aiVerdict: string | null;
  aiReason: string | null;
} {
  if (result.reason === 'SKIPPED') {
    return { aiVerdict: 'SKIPPED', aiReason: result.reason };
  }

  if (result.passed) {
    return { aiVerdict: 'PASSED', aiReason: result.reason };
  }

  return { aiVerdict: 'FAILED', aiReason: result.reason };
}

function buildLogPayload(
  taskType: LegacyTaskType,
  _input: SubmitTaskInput | UpdateProofInput,
): {
  state: string;
  value?: number;
  subPoints?: Record<string, string>;
} {
  if (taskType === 'WATER') {
    return { state: 'DONE', value: 3.8 };
  }

  if (taskType === 'READING') {
    return {
      state: 'DONE',
      subPoints: {
        PAGES_10: 'DONE',
        NON_FICTION: 'DONE',
      },
    };
  }

  if (taskType === 'DIET') {
    return {
      state: 'DONE',
      subPoints: {
        HEALTHY: 'DONE',
        NO_JUNK: 'DONE',
        NO_ALCOHOL: 'DONE',
      },
    };
  }

  if (taskType === 'OUTDOOR_WORKOUT' || taskType === 'INDOOR_WORKOUT') {
    return {
      state: 'DONE',
      subPoints: {
        MIN_45: 'DONE',
        OUTSIDE: taskType === 'OUTDOOR_WORKOUT' ? 'DONE' : 'FAILED',
      },
    };
  }

  return { state: 'DONE' };
}

async function getActiveChallenge(prisma: PrismaService, userId: string) {
  const challenge = await prisma.challenge.findFirst({
    where: { userId, isActive: true },
    orderBy: { startDate: 'desc' },
  });

  if (!challenge) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No active challenge found',
    });
  }

  return challenge;
}

async function findActivityForTaskType(
  prisma: PrismaService,
  groupId: string | null | undefined,
  taskType: LegacyTaskType,
) {
  if (!groupId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Join a group to access challenge activities',
    });
  }

  const seedKey = TASK_TYPE_TO_SEED_KEY[taskType];
  const activity = await prisma.activity.findFirst({
    where: { groupId, seedKey, active: true },
  });

  if (!activity) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Activity not found for task type ${taskType}`,
    });
  }

  return activity;
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

    const challenge = await getActiveChallenge(prisma, userId);
    const todayDate = getUserLocalDate(user.timezone);
    const canSubmit = isBeforeMidnight(user.timezone);

    if (!user.groupId) {
      return {
        currentDay: challenge.currentDay,
        date: todayDate,
        canSubmit,
        tasks: [],
      };
    }

    const activities = await prisma.activity.findMany({
      where: { groupId: user.groupId, active: true, scored: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (activities.length === 0) {
      return {
        currentDay: challenge.currentDay,
        date: todayDate,
        canSubmit,
        tasks: [],
      };
    }

    const logs = await prisma.activityLog.findMany({
      where: {
        userId,
        challengeId: challenge.id,
        date: todayDate,
      },
      include: { activity: true },
    });

    const logByActivityId = new Map(logs.map((log) => [log.activityId, log]));

    const tasks = activities.map((activity) => {
      const log = logByActivityId.get(activity.id) ?? null;
      const taskType = seedKeyToTaskType(activity.seedKey);

      return {
        taskType,
        title: activity.title,
        icon: activity.emoji ?? '✅',
        status: resolveTaskStatus(log, canSubmit),
        taskLogId: log?.id ?? null,
        proofUrl: log?.proofUrl ?? null,
        proofNotes: null,
        bookTitle: null,
        pageFrom: null,
        pageTo: null,
        dietConfirmed: log?.state === 'DONE' && taskType === 'DIET',
        aiVerdict: log?.aiVerdict ?? null,
        aiReason: null,
        completedAt: log?.state === 'DONE' ? todayDate : null,
        canEdit: canSubmit && Boolean(log),
      };
    });

    return {
      currentDay: challenge.currentDay,
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

    const challenge = await getActiveChallenge(prisma, userId);
    const todayDate = getUserLocalDate(user.timezone);
    const activity = await findActivityForTaskType(
      prisma,
      user.groupId,
      input.taskType,
    );

    const existing = await prisma.activityLog.findFirst({
      where: {
        challengeId: challenge.id,
        activityId: activity.id,
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
    const payload = buildLogPayload(input.taskType, input);

    const activityLog = await prisma.activityLog.create({
      data: {
        challengeId: challenge.id,
        userId,
        activityId: activity.id,
        date: todayDate,
        state: payload.state,
        value: payload.value,
        subPoints: payload.subPoints,
        proofUrl: input.proofUrl,
        xpAwarded: 0,
        ...aiFields,
      },
    });

    return activityLog;
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

    const activityLog = await prisma.activityLog.findFirst({
      where: { id: taskLogId, userId },
      include: { activity: true },
    });

    if (!activityLog) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Task log not found' });
    }

    const todayDate = getUserLocalDate(user.timezone);
    if (!isSameLocalDay(activityLog.date, todayDate, user.timezone)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Can only update proof for today',
      });
    }

    const taskType = seedKeyToTaskType(activityLog.activity.seedKey);

    const merged = {
      proofUrl: input.proofUrl ?? activityLog.proofUrl ?? undefined,
      proofNotes: input.proofNotes,
      bookTitle: input.bookTitle,
      pageFrom: input.pageFrom,
      pageTo: input.pageTo,
      dietConfirmed: input.dietConfirmed,
    };

    const validation = validateTaskInput(taskType, {
      taskType,
      ...merged,
    });

    if (!validation.isValid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: validation.reason ?? 'Invalid proof update',
      });
    }

    const proofUrlChanged =
      input.proofUrl !== undefined && input.proofUrl !== activityLog.proofUrl;
    const shouldVerify =
      needsAiVerification(taskType, merged.proofUrl) &&
      (proofUrlChanged || activityLog.aiVerdict === 'FAILED');

    const aiFields = shouldVerify
      ? await this.runVerification(taskType, merged.proofUrl)
      : {
          aiVerdict: activityLog.aiVerdict,
          aiReason: null,
        };

    const payload = buildLogPayload(taskType, { taskType, ...merged });

    return prisma.activityLog.update({
      where: { id: taskLogId },
      data: {
        proofUrl: merged.proofUrl,
        state: payload.state,
        value: payload.value,
        subPoints: payload.subPoints,
        aiVerdict: aiFields.aiVerdict,
      },
    });
  }

  private async runVerification(
    taskType: LegacyTaskType,
    proofUrl?: string | null,
  ): Promise<{
    aiVerdict: string | null;
    aiReason: string | null;
  }> {
    if (!needsAiVerification(taskType, proofUrl) || !proofUrl) {
      return { aiVerdict: null, aiReason: null };
    }

    const result = await this.proofVerifier.verifyProof(taskType, proofUrl);
    return mapVerificationToVerdict(result);
  }
}

export {
  computeCurrentStreak,
  computeDayLoggingStatus,
  isActivityLogLogged,
} from '../utils/day-completion';

export const ALL_TASK_TYPES = LEGACY_TASK_TYPES;
