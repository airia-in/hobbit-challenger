import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

test('shared brand constants identify the product as HOBBIT', async () => {
  const brand = await readText('packages/types/src/brand.ts');

  assert.match(brand, /export const BRAND_NAME = 'HOBBIT'/);
  assert.match(brand, /Here to annoy you into great habits/);
  assert.match(brand, /Hi, I'm Hobbit/);
});

test('buildDashboardUrl derives the dashboard path from WEB_DOMAIN', async () => {
  const webUrl = await readText('packages/types/src/web-url.ts');

  assert.match(webUrl, /export function buildDashboardUrl/);
  assert.match(webUrl, /\/dashboard`/);
  assert.match(webUrl, /normalizeWebDomain/);
});

test('shared web-url constants default to production HOBBIT domains', async () => {
  const webUrl = await readText('packages/types/src/web-url.ts');

  assert.match(webUrl, /const DEFAULT_WEB_DOMAIN = 'hobbit\.drcode\.ai'/);
  assert.match(webUrl, /const DEFAULT_API_DOMAIN = 'hobbit-api\.drcode\.ai'/);
  assert.match(webUrl, /export const DEFAULT_PUBLIC_API_URL = buildApiUrl\(\)/);
});

test('mobile prepare-web defaults to production HOBBIT API URL', async () => {
  const script = await readText('apps/mobile/scripts/prepare-web.mjs');

  assert.match(
    script,
    /PUBLIC_API_URL \?\? 'https:\/\/hobbit-api\.drcode\.ai'/,
  );
  assert.doesNotMatch(script, /api\.drcode\.app/);
});

test('api compose wires WEB_DOMAIN for reminder messaging', async () => {
  const compose = await readText('docker-compose.yml');

  assert.match(compose, /WEB_DOMAIN: \$\{WEB_DOMAIN:-hobbit\.drcode\.ai\}/);
});
