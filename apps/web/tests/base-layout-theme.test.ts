import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const layoutPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/layouts/BaseLayout.astro',
);

describe('BaseLayout theme bootstrap', () => {
  it('includes inline FOUC prevention script in head', () => {
    const layout = readFileSync(layoutPath, 'utf8');
    expect(layout).toContain('is:inline');
    expect(layout).toContain('set:html={themeInitScript}');
    expect(layout).toContain("from '../lib/theme'");
    expect(layout).toContain('theme-color');
  });

  it('includes dynamic theme-color meta tag', () => {
    const layout = readFileSync(layoutPath, 'utf8');
    expect(layout).toContain('name="theme-color"');
  });

  it('uses semantic background token on body', () => {
    const layout = readFileSync(layoutPath, 'utf8');
    expect(layout).toContain('bg-[var(--bg-base)]');
  });
});
