#!/usr/bin/env node

import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  ANDROID_PACKAGE_NAME,
  ASSETLINKS_RELATION,
  buildAssetLinksPayload,
  normalizeSha256Fingerprint,
  parseSha256Fingerprints,
  shouldRequireAssetLinksFingerprints,
} from './lib/android-app-links.mjs';

export {
  ANDROID_PACKAGE_NAME,
  ASSETLINKS_RELATION,
  buildAssetLinksPayload,
  normalizeSha256Fingerprint,
  parseSha256Fingerprints,
  shouldRequireAssetLinksFingerprints,
};

export const ASSETLINKS_PUBLIC_RELATIVE_PATH =
  'apps/web/public/.well-known/assetlinks.json';

export async function writeAssetLinksFile({
  outputPath,
  packageName = process.env.ANDROID_PACKAGE_NAME?.trim() ||
    ANDROID_PACKAGE_NAME,
  sha256CertFingerprints = parseSha256Fingerprints(
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS,
  ),
} = {}) {
  if (!outputPath) {
    throw new Error('writeAssetLinksFile requires outputPath.');
  }

  if (sha256CertFingerprints.length === 0) {
    if (shouldRequireAssetLinksFingerprints()) {
      throw new Error(
        'ANDROID_SHA256_CERT_FINGERPRINTS is required but unset or empty.',
      );
    }

    console.warn(
      'ANDROID_SHA256_CERT_FINGERPRINTS is unset; omitting assetlinks.json. App Links stay in chooser-fallback until fingerprints are configured at build time.',
    );

    try {
      await unlink(outputPath);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
        throw error;
      }
    }

    return null;
  }

  const payload = buildAssetLinksPayload({
    packageName,
    sha256CertFingerprints,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return payload;
}

async function main() {
  const repoDir = process.cwd();
  const outputPath = path.join(repoDir, ASSETLINKS_PUBLIC_RELATIVE_PATH);

  const payload = await writeAssetLinksFile({ outputPath });
  if (payload) {
    console.log(`Wrote ${outputPath}`);
  } else {
    console.log(`Omitted ${outputPath}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
