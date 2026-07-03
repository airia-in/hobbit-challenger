import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const rootDir = new URL('../', import.meta.url);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

async function loadGenerateAssetlinks() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/generate-assetlinks.mjs'),
  );
  return import(moduleUrl.href);
}

test('shared android-app-links constants match the Capacitor application id', async () => {
  const androidLinks = await readText(
    'packages/types/src/android-app-links.ts',
  );
  const manifest = await readText(
    'apps/mobile/android/app/src/main/AndroidManifest.xml',
  );

  assert.match(
    androidLinks,
    /export const ANDROID_PACKAGE_NAME = 'com\.drcode\.hobbit'/,
  );
  assert.match(manifest, /android:host="hobbit\.drcode\.ai"/);
});

const SAMPLE_FINGERPRINT =
  '14:6D:E9:25:B5:2F:46:FD:8D:65:19:FB:FF:0D:56:8F:0B:8C:F4:30:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55';

test('buildAssetLinksPayload includes required Digital Asset Links keys', async () => {
  const { buildAssetLinksPayload } = await loadGenerateAssetlinks();

  const payload = buildAssetLinksPayload({
    sha256CertFingerprints: [SAMPLE_FINGERPRINT],
  });

  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 1);

  const entry = payload[0];
  assert.deepEqual(entry.relation, [
    'delegate_permission/common.handle_all_urls',
  ]);
  assert.equal(entry.target.namespace, 'android_app');
  assert.equal(entry.target.package_name, 'com.drcode.hobbit');
  assert.deepEqual(entry.target.sha256_cert_fingerprints, [SAMPLE_FINGERPRINT]);
});

test('assetlinks package name stays aligned with DEFAULT_WEB_DOMAIN guardrail', async () => {
  const webUrl = await readText('packages/types/src/web-url.ts');
  const androidLinks = await readText(
    'packages/types/src/android-app-links.ts',
  );

  const domainMatch = webUrl.match(
    /export const DEFAULT_WEB_DOMAIN = '([^']+)'/,
  );
  assert.ok(domainMatch, 'DEFAULT_WEB_DOMAIN must be defined in web-url.ts');

  assert.match(
    androidLinks,
    /export const ANDROID_PACKAGE_NAME = 'com\.drcode\.hobbit'/,
  );
  assert.match(
    await readText('apps/mobile/capacitor.config.ts'),
    /appId: 'com\.drcode\.hobbit'/,
  );
});

test('normalizeSha256Fingerprint accepts colon-separated and compact hex', async () => {
  const { normalizeSha256Fingerprint } = await loadGenerateAssetlinks();
  const compact = SAMPLE_FINGERPRINT.replaceAll(':', '');

  assert.equal(
    normalizeSha256Fingerprint(SAMPLE_FINGERPRINT),
    SAMPLE_FINGERPRINT,
  );
  assert.equal(normalizeSha256Fingerprint(compact), SAMPLE_FINGERPRINT);
});

test('build-frontends generates assetlinks before staging Astro output', async () => {
  const buildFrontends = await readText('scripts/build-frontends.mjs');

  assert.match(buildFrontends, /writeAssetLinksFile/);
  assert.match(
    buildFrontends,
    /apps\/web\/public\/\.well-known\/assetlinks\.json/,
  );
});

test('web-host Dockerfile passes ANDROID_SHA256_CERT_FINGERPRINTS into the image build', async () => {
  const dockerfile = await readText('apps/web-host/Dockerfile');
  const compose = await readText('docker-compose.yml');

  assert.match(dockerfile, /ARG ANDROID_SHA256_CERT_FINGERPRINTS/);
  assert.match(compose, /ANDROID_SHA256_CERT_FINGERPRINTS/);
});

test('.env.example documents ANDROID_SHA256_CERT_FINGERPRINTS for App Links', async () => {
  const envExample = await readText('.env.example');

  assert.match(envExample, /ANDROID_SHA256_CERT_FINGERPRINTS/);
  assert.match(envExample, /keytool/i);
});
