import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStaticHostServer } from '../dist/static-host.js';

async function createFixtureSite(rootDir, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }
}

async function withServer(t, options) {
  const server = createStaticHostServer(options);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.notEqual(address, null);

  return `http://127.0.0.1:${address.port}`;
}

test('serves the primary Astro app at root and the secondary app below its base path', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'web-host-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const primaryRoot = path.join(workspace, 'primary');
  const secondaryRoot = path.join(workspace, 'secondary');

  await createFixtureSite(primaryRoot, {
    'index.html': '<h1>Primary</h1>',
    'de/index.html': '<h1>Deutsch</h1>',
  });
  await createFixtureSite(secondaryRoot, {
    'index.html': '<h1>Secondary</h1>',
  });

  const origin = await withServer(t, {
    sites: [
      { name: 'primary', basePath: '/', rootDir: primaryRoot },
      { name: 'secondary', basePath: '/secondary', rootDir: secondaryRoot },
    ],
  });

  const [home, localized, secondary] = await Promise.all([
    fetch(`${origin}/`).then((response) => response.text()),
    fetch(`${origin}/de/`).then((response) => response.text()),
    fetch(`${origin}/secondary/`).then((response) => response.text()),
  ]);

  assert.match(home, /Primary/);
  assert.match(localized, /Deutsch/);
  assert.match(secondary, /Secondary/);
});

test('redirects secondary app base path to its trailing-slash root', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'web-host-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const primaryRoot = path.join(workspace, 'primary');
  const secondaryRoot = path.join(workspace, 'secondary');

  await createFixtureSite(primaryRoot, {
    'index.html': '<h1>Primary</h1>',
  });
  await createFixtureSite(secondaryRoot, {
    'index.html': '<h1>Secondary</h1>',
  });

  const origin = await withServer(t, {
    sites: [
      { name: 'primary', basePath: '/', rootDir: primaryRoot },
      { name: 'secondary', basePath: '/secondary', rootDir: secondaryRoot },
    ],
  });

  const response = await fetch(`${origin}/secondary`, { redirect: 'manual' });

  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/secondary/');
});

test('redirects legacy join invite paths to query token URL', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'web-host-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const primaryRoot = path.join(workspace, 'primary');

  await createFixtureSite(primaryRoot, {
    'index.html': '<h1>Primary</h1>',
    'join/index.html': '<h1>Join</h1>',
  });

  const origin = await withServer(t, {
    sites: [{ name: 'primary', basePath: '/', rootDir: primaryRoot }],
  });

  const response = await fetch(`${origin}/join/some-uuid-token/`, {
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/join?token=some-uuid-token');
});

test('does not serve files outside the mounted site root', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'web-host-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const primaryRoot = path.join(workspace, 'primary');
  const outsideRoot = path.join(workspace, 'outside');

  await createFixtureSite(primaryRoot, {
    'index.html': '<h1>Primary</h1>',
  });
  await createFixtureSite(outsideRoot, {
    'secret.txt': 'private',
  });

  const origin = await withServer(t, {
    sites: [{ name: 'primary', basePath: '/', rootDir: primaryRoot }],
  });

  const response = await fetch(`${origin}/../outside/secret.txt`);

  assert.equal(response.status, 404);
});
