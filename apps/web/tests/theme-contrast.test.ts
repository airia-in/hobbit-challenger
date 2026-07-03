import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const tokensPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/styles/tokens.css',
);

function parseHex(value: string): string {
  return value.trim().toLowerCase();
}

function parseLightThemeTokens(css: string): Record<string, string> {
  const block = css.match(/\[data-theme='light'\]\s*\{([^}]+)\}/)?.[1];
  if (!block) throw new Error('light theme block not found');

  const tokens: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = line.match(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]+);/);
    if (match) tokens[match[1]!] = parseHex(match[2]!);
  }
  return tokens;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(
    (index) => parseInt(value.slice(index, index + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('light theme accent contrast', () => {
  const tokens = parseLightThemeTokens(readFileSync(tokensPath, 'utf8'));
  const surface = tokens['--surface']!;
  const surfaceRaised = tokens['--surface-raised']!;
  const bgBase = tokens['--bg-base']!;

  it('defines light-theme overrides for gold, gold-fill, and success', () => {
    expect(tokens['--gold']).toBe('#92400e');
    expect(tokens['--gold-fill']).toBe('#f5c842');
    expect(tokens['--success']).toBe('#166534');
    expect(tokens['--text-muted']).toBe('#57534e');
    expect(tokens['--accent-red']).toBe('#d42b22');
  });

  it('keeps gold text at or above 4.5:1 on light surfaces', () => {
    const gold = tokens['--gold']!;
    expect(contrastRatio(gold, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(gold, surfaceRaised)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps success text at or above 4.5:1 on light surfaces', () => {
    const success = tokens['--success']!;
    expect(contrastRatio(success, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(success, surfaceRaised)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps podium silver and bronze text at or above 4.5:1 on light surfaces', () => {
    for (const key of ['--silver', '--bronze'] as const) {
      const value = tokens[key]!;
      expect(contrastRatio(value, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(value, surfaceRaised)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps muted text at or above 4.5:1 on bg-base', () => {
    const muted = tokens['--text-muted']!;
    expect(contrastRatio(muted, bgBase)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps accent button text at or above 4.5:1', () => {
    expect(
      contrastRatio('#ffffff', tokens['--accent-red']!),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
