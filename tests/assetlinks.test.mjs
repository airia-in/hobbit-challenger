import test from 'node:test';
import assert from 'node:assert/strict';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';

const rootDir = new URL('../', import.meta.url);

const SAMPLE_FINGERPRINT =
  '14:6D:E9:25:B5:2F:46:FD:8D:65:19:FB:FF:0D:56:8F:0B:8C:F4:30:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55';

const SECOND_FINGERPRINT =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

async function loadGenerateAssetlinks() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/generate-assetlinks.mjs'),
  );
  return import(moduleUrl.href);
}

async function loadAndroidAppLinksLib() {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'scripts/lib/android-app-links.mjs'),
  );
  return import(moduleUrl.href);
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

test('android-app-links constants match between packages/types and scripts/lib', async () => {
  const typesSource = await readText('packages/types/src/android-app-links.ts');
  const { ANDROID_PACKAGE_NAME, ASSETLINKS_RELATION } =
    await loadAndroidAppLinksLib();

  assert.match(
    typesSource,
    new RegExp(
      `export const ANDROID_PACKAGE_NAME = '${ANDROID_PACKAGE_NAME.replaceAll('.', '\\.')}'`,
    ),
  );
  assert.match(typesSource, /delegate_permission\/common\.handle_all_urls/);
  assert.deepEqual(ASSETLINKS_RELATION, [
    'delegate_permission/common.handle_all_urls',
  ]);
});

test('shared android-app-links constants match the Capacitor application id', async () => {
  const { ANDROID_PACKAGE_NAME } = await loadAndroidAppLinksLib();
  const manifest = await readText(
    'apps/mobile/android/app/src/main/AndroidManifest.xml',
  );

  assert.equal(ANDROID_PACKAGE_NAME, 'com.drcode.hobbit');
  assert.match(manifest, /android:host="hobbit\.drcode\.ai"/);
});

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

test('validateAssetLinksPayload rejects empty fingerprint arrays', async () => {
  const { buildAssetLinksPayload, validateAssetLinksPayload } =
    await loadAndroidAppLinksLib();

  assert.throws(
    () =>
      validateAssetLinksPayload(
        buildAssetLinksPayload({ sha256CertFingerprints: [] }),
      ),
    /sha256_cert_fingerprints must be non-empty/,
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

test('parseSha256Fingerprints normalizes comma-separated fingerprints', async () => {
  const { parseSha256Fingerprints } = await loadGenerateAssetlinks();

  const parsed = parseSha256Fingerprints(
    `${SAMPLE_FINGERPRINT},${SECOND_FINGERPRINT}`,
  );

  assert.deepEqual(parsed, [SAMPLE_FINGERPRINT, SECOND_FINGERPRINT]);
});

test('parseSha256Fingerprints rejects invalid fingerprint values', async () => {
  const { parseSha256Fingerprints } = await loadGenerateAssetlinks();

  assert.throws(
    () => parseSha256Fingerprints('not-a-fingerprint'),
    /Invalid SHA-256 fingerprint/,
  );
});

test('writeAssetLinksFile writes schema-valid JSON to the requested path', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'assetlinks-write-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const outputPath = path.join(workspace, '.well-known/assetlinks.json');
  const { writeAssetLinksFile } = await loadGenerateAssetlinks();
  const { validateAssetLinksPayload } = await loadAndroidAppLinksLib();

  const payload = await writeAssetLinksFile({
    outputPath,
    sha256CertFingerprints: [SAMPLE_FINGERPRINT],
  });

  assert.ok(payload);
  const written = JSON.parse(await readFile(outputPath, 'utf8'));
  validateAssetLinksPayload(written);
  assert.deepEqual(written, payload);
});

test('writeAssetLinksFile omits assetlinks.json when fingerprints are unset', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'assetlinks-omit-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const outputPath = path.join(workspace, '.well-known/assetlinks.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, '[]\n', 'utf8');

  const { writeAssetLinksFile } = await loadGenerateAssetlinks();

  const payload = await writeAssetLinksFile({
    outputPath,
    sha256CertFingerprints: [],
  });

  assert.equal(payload, null);
  assert.equal(await pathExists(outputPath), false);
});

test('writeAssetLinksFile fails closed when fingerprints are required', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'assetlinks-require-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const outputPath = path.join(workspace, '.well-known/assetlinks.json');
  const { writeAssetLinksFile } = await loadGenerateAssetlinks();
  const previous = process.env.REQUIRE_ASSETLINKS_FINGERPRINTS;

  t.after(() => {
    if (previous === undefined) {
      delete process.env.REQUIRE_ASSETLINKS_FINGERPRINTS;
    } else {
      process.env.REQUIRE_ASSETLINKS_FINGERPRINTS = previous;
    }
  });

  process.env.REQUIRE_ASSETLINKS_FINGERPRINTS = '1';

  await assert.rejects(
    () =>
      writeAssetLinksFile({
        outputPath,
        sha256CertFingerprints: [],
      }),
    /ANDROID_SHA256_CERT_FINGERPRINTS is required but unset or empty/,
  );
});

test('assetlinks.json reaches web-host staging layout when copied from frontend dist', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'assetlinks-stage-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const publicPath = path.join(
    workspace,
    'apps/web/public/.well-known/assetlinks.json',
  );
  const distPath = path.join(
    workspace,
    'apps/web/dist/.well-known/assetlinks.json',
  );
  const stagingPath = path.join(
    workspace,
    'apps/web-host/sites/web/.well-known/assetlinks.json',
  );

  const { writeAssetLinksFile } = await loadGenerateAssetlinks();
  const { validateAssetLinksPayload } = await loadAndroidAppLinksLib();

  await writeAssetLinksFile({
    outputPath: publicPath,
    sha256CertFingerprints: [SAMPLE_FINGERPRINT],
  });
  await mkdir(path.dirname(distPath), { recursive: true });
  await cp(publicPath, distPath);
  await mkdir(path.dirname(stagingPath), { recursive: true });
  await cp(distPath, stagingPath);

  validateAssetLinksPayload(JSON.parse(await readFile(stagingPath, 'utf8')));
});

test('validate-assetlinks.mjs validates generated file content on disk', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'assetlinks-validate-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const outputPath = path.join(workspace, 'assetlinks.json');
  const { writeAssetLinksFile } = await loadGenerateAssetlinks();
  const { validateAssetLinksPayload } = await loadAndroidAppLinksLib();

  await writeAssetLinksFile({
    outputPath,
    sha256CertFingerprints: [SAMPLE_FINGERPRINT],
  });

  validateAssetLinksPayload(JSON.parse(await readFile(outputPath, 'utf8')));
});

test('publish workflows pass ANDROID_SHA256_CERT_FINGERPRINTS into web-host image builds', async () => {
  const buildPublish = await readText(
    '.github/workflows/build-and-publish.yml',
  );
  const release = await readText('.github/workflows/release.yml');

  assert.match(buildPublish, /secrets\.ANDROID_SHA256_CERT_FINGERPRINTS/);
  assert.match(
    buildPublish,
    /REQUIRE_ASSETLINKS_FINGERPRINTS=\$\{\{ matrix\.app == 'web-host'/,
  );
  assert.match(release, /secrets\.ANDROID_SHA256_CERT_FINGERPRINTS/);
  assert.match(
    release,
    /REQUIRE_ASSETLINKS_FINGERPRINTS=\$\{\{ matrix\.app == 'web-host'/,
  );
});

test('.env.example documents ANDROID_SHA256_CERT_FINGERPRINTS for App Links', async () => {
  const envExample = await readText('.env.example');

  assert.match(envExample, /ANDROID_SHA256_CERT_FINGERPRINTS/);
  assert.match(envExample, /keytool/i);
});
