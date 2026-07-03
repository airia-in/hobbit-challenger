import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type MilestoneKey,
  MILESTONE_CARD_TEMPLATE_VERSION,
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

/** Max grapheme clusters rendered in postcard first-name line (#174). */
export const MAX_MILESTONE_CARD_FIRST_NAME_LENGTH = 64;

const CARD_FILENAME_PATTERN =
  /^[A-Za-z0-9_-]+_(streak_7|streak_21|streak_30|streak_66|first_perfect_day|first_perfect_week|total_logs_100|habit_streak_14|comeback|first_freeze_consumed)_[a-f0-9]{12}\.png$/;

function stripControlChars(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 31 || code === 127 || (code >= 128 && code <= 159)) {
      continue;
    }
    result += char;
  }
  return result;
}

export function extractFirstName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return 'Traveler';
  }
  const [first] = trimmed.split(/\s+/);
  return first || 'Traveler';
}

/**
 * Bounds and normalizes user-provided first name before SVG interpolation.
 * Strips control characters and caps length; XML escaping happens in art layer.
 */
export function sanitizeFirstNameForCard(displayName: string): string {
  const first = stripControlChars(extractFirstName(displayName)).trim();
  if (!first) {
    return 'Traveler';
  }
  return [...first].slice(0, MAX_MILESTONE_CARD_FIRST_NAME_LENGTH).join('');
}

export function milestoneCardContentHash(
  firstName: string,
  milestoneKey: MilestoneKey,
): string {
  const payload = `${MILESTONE_CARD_TEMPLATE_VERSION}:${sanitizeFirstNameForCard(firstName)}:${milestoneKey}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

export function milestoneCardFilename(
  userId: string,
  milestoneKey: MilestoneKey,
  contentHash: string,
): string {
  return `${userId}_${milestoneKey}_${contentHash}.png`;
}

export function isValidMilestoneCardFilename(filename: string): boolean {
  return CARD_FILENAME_PATTERN.test(filename);
}

export function resolveMilestoneCardDir(uploadDir: string): string {
  return path.join(uploadDir, 'milestone-cards');
}

export function resolveMilestoneCardPath(
  cardDir: string,
  userId: string,
  milestoneKey: MilestoneKey,
  contentHash: string,
): string {
  const filename = milestoneCardFilename(userId, milestoneKey, contentHash);
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

/**
 * Removes superseded PNGs for the same user+milestone (content-hash rotation).
 * Keeps at most one cached file per user per milestone key on disk.
 */
export async function pruneStaleMilestoneCardVersions(
  cardDir: string,
  userId: string,
  milestoneKey: MilestoneKey,
  keepFilename: string,
): Promise<void> {
  const prefix = `${userId}_${milestoneKey}`;
  let entries: string[];
  try {
    entries = await readdir(cardDir);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry !== keepFilename &&
          entry.startsWith(prefix) &&
          entry.endsWith('.png'),
      )
      .map((entry) => unlink(path.join(cardDir, entry)).catch(() => undefined)),
  );
}

async function writeCardCacheAtomic(
  cachePath: string,
  buffer: Buffer,
): Promise<void> {
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, buffer);
  await rename(tempPath, cachePath);
}

export async function renderMilestoneCardPng(input: {
  firstName: string;
  milestoneKey: MilestoneKey;
}): Promise<Buffer> {
  const stat = getMilestoneCardStat(input.milestoneKey);
  const svg = buildMilestoneCardSvg({
    firstName: sanitizeFirstNameForCard(input.firstName),
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
    const sanitizedFirstName = sanitizeFirstNameForCard(input.firstName);
    const contentHash = milestoneCardContentHash(
      sanitizedFirstName,
      input.milestoneKey,
    );
    const cachePath = resolveMilestoneCardPath(
      this.cardDir,
      input.userId,
      input.milestoneKey,
      contentHash,
    );
    const filename = path.basename(cachePath);

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
      firstName: sanitizedFirstName,
      milestoneKey: input.milestoneKey,
    });
    await writeCardCacheAtomic(cachePath, buffer);
    await pruneStaleMilestoneCardVersions(
      this.cardDir,
      input.userId,
      input.milestoneKey,
      filename,
    );

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
