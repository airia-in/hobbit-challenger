import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { LegacyTaskType } from './activities.service';
import {
  getPromptsDir,
  loadPromptFile,
  parsePromptMarkdown,
  type PromptContent,
} from './prompt-loader';

export type VerificationResult = {
  passed: boolean;
  confidence: number;
  reason: string;
};

const PROMPT_FILES: Partial<Record<LegacyTaskType, string>> = {
  OUTDOOR_WORKOUT: 'outdoor-workout.md',
  INDOOR_WORKOUT: 'indoor-workout.md',
  WATER: 'water.md',
  PROGRESS_PHOTO: 'progress-photo.md',
};

@Injectable()
export class ProofVerifierService {
  private readonly openai: OpenAI | null;
  private readonly model: string;
  private readonly uploadDir: string;
  private readonly promptCache = new Map<string, PromptContent>();

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const baseURL = this.config.get<string>('OPENAI_BASE_URL');
    this.model =
      this.config.get<string>('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';
    this.uploadDir = path.resolve(
      this.config.get<string>('UPLOAD_DIR') ?? './data/uploads',
    );

    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL: baseURL || undefined,
      });
    } else {
      this.openai = null;
    }
  }

  async verifyProof(
    taskType: LegacyTaskType,
    imageUrl: string,
  ): Promise<VerificationResult> {
    if (!this.openai) {
      return { passed: true, confidence: 0, reason: 'SKIPPED' };
    }

    try {
      const prompt = await this.loadPrompt(taskType);
      const resolvedImageUrl = await this.resolveImageUrl(imageUrl);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: prompt.system },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt.user },
              {
                type: 'image_url',
                image_url: { url: resolvedImageUrl },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty OpenAI response');
      }

      const parsed = JSON.parse(content) as Partial<VerificationResult>;
      return {
        passed: Boolean(parsed.passed),
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        reason:
          typeof parsed.reason === 'string'
            ? parsed.reason
            : 'No reason provided',
      };
    } catch (error) {
      console.error('Proof verification failed:', error);
      return { passed: false, confidence: 0, reason: 'ERROR' };
    }
  }

  private async loadPrompt(taskType: LegacyTaskType): Promise<PromptContent> {
    const filename = PROMPT_FILES[taskType];
    if (!filename) {
      throw new Error(`No prompt configured for task type ${taskType}`);
    }

    const cached = this.promptCache.get(filename);
    if (cached) {
      return cached;
    }

    const parsed = await loadPromptFile(filename);
    this.promptCache.set(filename, parsed);
    return parsed;
  }

  private async resolveImageUrl(imageUrl: string): Promise<string> {
    const filePath = resolveUploadFilePath(this.uploadDir, imageUrl);
    const buffer = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';

    return `data:${mime};base64,${buffer.toString('base64')}`;
  }
}

/** Resolve a proof image to a filesystem path confined under uploadDir. */
export function resolveUploadFilePath(
  uploadDir: string,
  imageUrl: string,
): string {
  // Never fetch or read arbitrary remote/embedded content server-side (SSRF / data-URI abuse).
  if (/^[a-z][a-z0-9+.-]*:/i.test(imageUrl)) {
    throw new Error('External or scheme URLs are not allowed');
  }

  const relativePath = imageUrl.startsWith('/uploads/')
    ? imageUrl.slice('/uploads/'.length)
    : imageUrl.replace(/^\/+/, '');

  const normalizedUploadDir = path.resolve(uploadDir);
  const resolved = path.resolve(normalizedUploadDir, relativePath);

  // Block .. traversal: resolved path must stay inside uploadDir.
  if (
    resolved !== normalizedUploadDir &&
    !resolved.startsWith(normalizedUploadDir + path.sep)
  ) {
    throw new Error('Path escapes upload directory');
  }

  return resolved;
}

// Re-export for tests that may import parsePromptMarkdown from here
export { getPromptsDir, parsePromptMarkdown };
