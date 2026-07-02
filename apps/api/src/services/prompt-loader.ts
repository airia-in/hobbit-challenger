import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type PromptContent = {
  system: string;
  user: string;
};

const promptCache = new Map<string, PromptContent>();

export function parsePromptJinja(raw: string): PromptContent {
  const systemMatch = raw.match(/## System\s+([\s\S]*?)(?=## User|$)/i);
  const userMatch = raw.match(/## User\s+([\s\S]*?)$/i);

  const system = systemMatch?.[1]?.trim();
  const user = userMatch?.[1]?.trim();

  if (!system || !user) {
    throw new Error(
      'Prompt templates must include ## System and ## User sections',
    );
  }

  return { system, user };
}

/** @deprecated Use parsePromptJinja — kept for existing imports/tests. */
export const parsePromptMarkdown = parsePromptJinja;

export function getPromptsDir(): string {
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

export async function loadPromptFile(filename: string): Promise<PromptContent> {
  const cached = promptCache.get(filename);
  if (cached) {
    return cached;
  }

  const promptPath = path.join(getPromptsDir(), filename);
  const raw = await readFile(promptPath, 'utf8');
  const parsed = parsePromptJinja(raw);
  promptCache.set(filename, parsed);
  return parsed;
}

export function clearPromptCache(): void {
  promptCache.clear();
}
