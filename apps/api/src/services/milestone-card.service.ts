import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type MilestoneKey,
  MILESTONE_KEYS,
  getMilestoneCardStat,
} from '@workspace-starter/types';
import sharp from 'sharp';
import {
  MILESTONE_CARD_HEIGHT,
  MILESTONE_CARD_WIDTH,
  buildMilestoneCardSvg,
} from './milestone-card-art';

export type MilestoneCardResult = {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/png';
  cachePath: string;
};

const CARD_FILENAME_PATTERN =
  /^[A-Za-z0-9_-]+_(streak_7|streak_21|streak_30|streak_66|first_perfect_day|first_perfect_week|total_logs_100|habit_streak_14|comeback|first_freeze_consumed)\.png$/;

export function milestoneCardFilename(
  userId: string,
  milestoneKey: MilestoneKey,
): string {
  return `${userId}_${milestoneKey}.png`;
}

export function isValidMilestoneCardFilename(filename: string): boolean {
  return CARD_FILENAME_PATTERN.test(filename);
}

export function extractFirstName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return 'Traveler';
  }
  const [first] = trimmed.split(/\s+/);
  return first || 'Traveler';
}

export function resolveMilestoneCardDir(uploadDir: string): string {
  return path.join(uploadDir, 'milestone-cards');
}

export function resolveMilestoneCardPath(
  cardDir: string,
  userId: string,
  milestoneKey: MilestoneKey,
): string {
  const filename = milestoneCardFilename(userId, milestoneKey);
  const cardRoot = path.resolve(cardDir);
  const filePath = path.resolve(cardRoot, filename);
  if (filePath !== path.join(cardRoot, path.basename(filePath))) {
    throw new Error('Invalid milestone card path');
  }
  return filePath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function renderMilestoneCardPng(input: {
  firstName: string;
  milestoneKey: MilestoneKey;
}): Promise<Buffer> {
  const stat = getMilestoneCardStat(input.milestoneKey);
  const svg = buildMilestoneCardSvg({
    firstName: input.firstName,
    milestoneKey: input.milestoneKey,
    statLabel: stat.label,
    statValue: stat.value,
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export function isMilestoneKey(value: string): value is MilestoneKey {
  return (MILESTONE_KEYS as readonly string[]).includes(value);
}

@Injectable()
export class MilestoneCardService {
  private readonly cardDir: string;

  constructor(private readonly config: ConfigService) {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const uploadDir = path.isAbsolute(
      this.config.get<string>('UPLOAD_DIR') ?? '',
    )
      ? (this.config.get<string>('UPLOAD_DIR') as string)
      : path.resolve(
          repoRoot,
          this.config.get<string>('UPLOAD_DIR') ?? 'data/uploads',
        );
    this.cardDir = resolveMilestoneCardDir(uploadDir);
  }

  getCardDirectory(): string {
    return this.cardDir;
  }

  async ensureCardDirectory(): Promise<void> {
    await mkdir(this.cardDir, { recursive: true });
  }

  async getOrCreateCard(input: {
    userId: string;
    firstName: string;
    milestoneKey: MilestoneKey;
  }): Promise<MilestoneCardResult> {
    await this.ensureCardDirectory();
    const cachePath = resolveMilestoneCardPath(
      this.cardDir,
      input.userId,
      input.milestoneKey,
    );

    if (await fileExists(cachePath)) {
      const buffer = await readFile(cachePath);
      return {
        buffer,
        width: MILESTONE_CARD_WIDTH,
        height: MILESTONE_CARD_HEIGHT,
        mimeType: 'image/png',
        cachePath,
      };
    }

    const buffer = await renderMilestoneCardPng({
      firstName: input.firstName,
      milestoneKey: input.milestoneKey,
    });
    await writeFile(cachePath, buffer);

    return {
      buffer,
      width: MILESTONE_CARD_WIDTH,
      height: MILESTONE_CARD_HEIGHT,
      mimeType: 'image/png',
      cachePath,
    };
  }
}

export function pngContentDigest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
