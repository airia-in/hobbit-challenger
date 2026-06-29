import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskType } from '@workspace-starter/db';
import OpenAI from 'openai';

export type VerificationResult = {
  passed: boolean;
  confidence: number;
  reason: string;
};

const PROMPT_FILES: Partial<Record<TaskType, string>> = {
  [TaskType.OUTDOOR_WORKOUT]: 'outdoor-workout.md',
  [TaskType.INDOOR_WORKOUT]: 'indoor-workout.md',
  [TaskType.WATER]: 'water.md',
  [TaskType.PROGRESS_PHOTO]: 'progress-photo.md',
  [TaskType.DIET]: 'diet.md',
};

type PromptContent = {
  system: string;
  user: string;
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
    taskType: TaskType,
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
      return { passed: true, confidence: 0, reason: 'SKIPPED' };
    }
  }

  private async loadPrompt(taskType: TaskType): Promise<PromptContent> {
    const filename = PROMPT_FILES[taskType];
    if (!filename) {
      throw new Error(`No prompt configured for task type ${taskType}`);
    }

    const cached = this.promptCache.get(filename);
    if (cached) {
      return cached;
    }

    const promptPath = path.join(this.getPromptsDir(), filename);
    const raw = await readFile(promptPath, 'utf8');
    const parsed = parsePromptMarkdown(raw);
    this.promptCache.set(filename, parsed);
    return parsed;
  }

  private getPromptsDir(): string {
    const candidates = [
      path.join(__dirname, 'prompts'),
      path.join(__dirname, '..', 'prompts'),
      path.join(process.cwd(), 'apps', 'api', 'src', 'prompts'),
      path.join(process.cwd(), 'src', 'prompts'),
    ];

    for (const dir of candidates) {
      if (existsSync(dir)) {
        return dir;
      }
    }

    throw new Error('Prompts directory not found');
  }

  private async resolveImageUrl(imageUrl: string): Promise<string> {
    if (/^https?:\/\//i.test(imageUrl)) {
      return imageUrl;
    }

    if (/^data:/i.test(imageUrl)) {
      return imageUrl;
    }

    const relativePath = imageUrl.startsWith('/uploads/')
      ? imageUrl.slice('/uploads/'.length)
      : imageUrl.replace(/^\/+/, '');

    const filePath = path.join(this.uploadDir, relativePath);
    const buffer = await readFile(filePath);
    const ext = path.extname(relativePath).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';

    return `data:${mime};base64,${buffer.toString('base64')}`;
  }
}

function parsePromptMarkdown(raw: string): PromptContent {
  const systemMatch = raw.match(/## System\s+([\s\S]*?)(?=## User|$)/i);
  const userMatch = raw.match(/## User\s+([\s\S]*?)$/i);

  const system = systemMatch?.[1]?.trim();
  const user = userMatch?.[1]?.trim();

  if (!system || !user) {
    throw new Error('Prompt markdown must include ## System and ## User sections');
  }

  return { system, user };
}
