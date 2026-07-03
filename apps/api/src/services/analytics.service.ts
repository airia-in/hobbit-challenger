import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@workspace-starter/db';
import { PrismaService } from '../prisma/prisma.service';

/** Canonical product event keys (PROPOSAL §5 instrumentation). */
export const PRODUCT_EVENT_KEYS = {
  ACTIVITY_LOGGED: 'activity.logged',
  DAY_FINALIZED: 'day.finalized',
  STREAK_BROKEN: 'streak.broken',
  STREAK_FREEZE_CONSUMED: 'streak.freeze_consumed',
  REMINDER_SENT: 'reminder.sent',
  MILESTONE_UNLOCKED: 'milestone.unlocked',
  MILESTONE_SHARED: 'milestone.shared',
  USER_REGISTERED: 'user.registered',
  GROUP_JOINED: 'group.joined',
} as const;

export type ProductEventKey =
  (typeof PRODUCT_EVENT_KEYS)[keyof typeof PRODUCT_EVENT_KEYS];

export type ProductEventMetadata = Record<
  string,
  string | number | boolean | null
>;

const BLOCKED_METADATA_KEYS = new Set([
  'phone',
  'phonenumber',
  'message',
  'messagebody',
  'text',
  'body',
  'email',
  'password',
  'name',
  'username',
  'anchor',
  'anchortext',
  'copy',
  'title',
]);

type TrackClient = Pick<PrismaService, 'productEvent'>;

type TrackOptions = {
  enabled?: boolean;
  logger?: Pick<Logger, 'error'>;
};

type AnalyticsEnv = Record<string, string | undefined>;

/**
 * Reads PRODUCT_ANALYTICS_ENABLED. Default ON when unset (production).
 * Set to `false` in test / staging to disable writes.
 */
export function isProductAnalyticsEnabled(
  source: ConfigService | AnalyticsEnv = process.env,
): boolean {
  const flag =
    'get' in source && typeof source.get === 'function'
      ? source.get<string>('PRODUCT_ANALYTICS_ENABLED')
      : (source as AnalyticsEnv).PRODUCT_ANALYTICS_ENABLED;

  if (flag === undefined || flag === '') {
    return true;
  }

  const normalized = flag.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function sanitizeMetadata(
  metadata?: ProductEventMetadata,
): Prisma.InputJsonValue | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_METADATA_KEYS.has(key.toLowerCase())) {
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Persists a product event. Never throws to callers — errors are logged only.
 */
export async function trackProductEvent(
  prisma: TrackClient,
  userId: string,
  eventKey: ProductEventKey,
  metadata?: ProductEventMetadata,
  options?: TrackOptions,
): Promise<void> {
  const enabled = options?.enabled ?? isProductAnalyticsEnabled();
  if (!enabled) {
    return;
  }

  const logger = options?.logger;

  try {
    await prisma.productEvent.create({
      data: {
        userId,
        eventKey,
        metadata: sanitizeMetadata(metadata),
      },
    });
  } catch (error) {
    logger?.error?.(`Product analytics track failed (${eventKey}):`, error);
  }
}

/** Fire-and-forget wrapper for mutation paths — never blocks or throws. */
export function trackProductEventFireAndForget(
  prisma: TrackClient,
  userId: string,
  eventKey: ProductEventKey,
  metadata?: ProductEventMetadata,
  options?: TrackOptions,
): void {
  void trackProductEvent(prisma, userId, eventKey, metadata, options).catch(
    (error) => {
      options?.logger?.error?.(
        `Product analytics track failed (${eventKey}):`,
        error,
      );
    },
  );
}

/** Emits `reminder.sent` only on successful WhatsApp delivery (SENT transition). */
export function trackReminderSentFireAndForget(
  prisma: TrackClient,
  userId: string,
  kind: string,
  status: string,
  options?: TrackOptions,
): void {
  if (status !== 'SENT') {
    return;
  }

  trackProductEventFireAndForget(
    prisma,
    userId,
    PRODUCT_EVENT_KEYS.REMINDER_SENT,
    { kind, status: 'SENT' },
    options,
  );
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly analyticsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.analyticsEnabled = isProductAnalyticsEnabled(this.config);
  }

  /** Fire-and-forget product event — never throws into callers. */
  track(
    userId: string,
    eventKey: ProductEventKey,
    metadata?: ProductEventMetadata,
  ): void {
    trackProductEventFireAndForget(this.prisma, userId, eventKey, metadata, {
      enabled: this.analyticsEnabled,
      logger: this.logger,
    });
  }
}
