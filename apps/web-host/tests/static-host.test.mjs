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

test('serves Digital Asset Links JSON with application/json content type', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'web-host-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const primaryRoot = path.join(workspace, 'primary');

  await createFixtureSite(primaryRoot, {
    '.well-known/assetlinks.json': JSON.stringify([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.drcode.hobbit',
          sha256_cert_fingerprints: [
            '14:6D:E9:25:B5:2F:46:FD:8D:65:19:FB:FF:0D:56:8F:0B:8C:F4:30:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55',
          ],
        },
      },
    ]),
  });

  const origin = await withServer(t, {
    sites: [{ name: 'primary', basePath: '/', rootDir: primaryRoot }],
  });

  const response = await fetch(`${origin}/.well-known/assetlinks.json`);

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-type'),
    'application/json; charset=utf-8',
  );
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');

  const payload = await response.json();
  assert.deepEqual(payload[0].relation, [
    'delegate_permission/common.handle_all_urls',
  ]);
  assert.equal(payload[0].target.namespace, 'android_app');
  assert.equal(payload[0].target.package_name, 'com.drcode.hobbit');
  assert.deepEqual(payload[0].target.sha256_cert_fingerprints, [
    '14:6D:E9:25:B5:2F:46:FD:8D:65:19:FB:FF:0D:56:8F:0B:8C:F4:30:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55',
  ]);
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
