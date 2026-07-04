import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);
const exists = async (rel) => {
  try {
    await access(new URL(rel, rootDir));
    return true;
  } catch {
    return false;
  }
};

test('mascot icon assets are present', async () => {
  const required = [
    'apps/web/public/favicon.svg',
    'apps/web/public/icon-maskable.svg',
    'apps/web/public/favicon-32.png',
    'apps/web/public/favicon-16.png',
    'apps/web/public/apple-touch-icon.png',
    'apps/web/public/icon-192.png',
    'apps/web/public/icon-512.png',
    'apps/web/public/site.webmanifest',
    'apps/mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
  ];
  for (const rel of required) {
    assert.equal(await exists(rel), true, `missing ${rel}`);
  }
});

test('BaseLayout wires favicon and manifest', async () => {
  const layout = await readFile(
    new URL('apps/web/src/layouts/BaseLayout.astro', rootDir),
    'utf8',
  );
  assert.match(layout, /rel="icon"[^>]*favicon\.svg/);
  assert.match(layout, /rel="apple-touch-icon"/);
  assert.match(layout, /rel="manifest"[^>]*site\.webmanifest/);
});

test('web manifest is valid JSON with maskable icons', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('apps/web/public/site.webmanifest', rootDir),
      'utf8',
    ),
  );
  assert.equal(manifest.name, 'HOBBIT');
  assert.ok(
    manifest.icons.some((i) => i.purpose === 'maskable'),
    'expected a maskable icon',
  );
});
