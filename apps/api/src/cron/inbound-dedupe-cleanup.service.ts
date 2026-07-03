import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_RETENTION_DAYS = 30;

function retentionDaysFromEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.INBOUND_DEDUPE_RETENTION_DAYS;
  if (!raw) {
    return DEFAULT_RETENTION_DAYS;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_RETENTION_DAYS;
}

@Injectable()
export class InboundDedupeCleanupService {
  private readonly logger = new Logger(InboundDedupeCleanupService.name);
  private readonly retentionDays = retentionDaysFromEnv();

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredRows(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000,
    );
    const result = await this.prisma.inboundMessageDedupe.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(
        `Purged ${result.count} inbound dedupe row(s) older than ${this.retentionDays} days`,
      );
    }
  }
}
