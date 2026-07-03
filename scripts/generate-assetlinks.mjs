#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const ANDROID_PACKAGE_NAME = 'com.drcode.hobbit';

const ASSETLINKS_RELATION = ['delegate_permission/common.handle_all_urls'];

const FINGERPRINT_PATTERN = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;

export function normalizeSha256Fingerprint(value) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }

  const colonSeparated = trimmed.includes(':')
    ? trimmed
    : (trimmed.match(/.{1,2}/g)?.join(':') ?? '');

  if (!FINGERPRINT_PATTERN.test(colonSeparated)) {
    throw new Error(
      `Invalid SHA-256 fingerprint "${value}". Expected 32 colon-separated hex octets.`,
    );
  }

  return colonSeparated;
}

export function parseSha256Fingerprints(rawValue) {
  if (!rawValue?.trim()) {
    return [];
  }

  return rawValue
    .split(',')
    .map((entry) => normalizeSha256Fingerprint(entry))
    .filter((entry) => entry !== null);
}

export function buildAssetLinksPayload({
  packageName = ANDROID_PACKAGE_NAME,
  sha256CertFingerprints = [],
} = {}) {
  return [
    {
      relation: [...ASSETLINKS_RELATION],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: sha256CertFingerprints,
      },
    },
  ];
}

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
    console.warn(
      'ANDROID_SHA256_CERT_FINGERPRINTS is unset; assetlinks.json will not verify App Links until fingerprints are injected at build time.',
    );
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
  const outputPath = path.join(
    repoDir,
    'apps/web/public/.well-known/assetlinks.json',
  );

  await writeAssetLinksFile({ outputPath });
  console.log(`Wrote ${outputPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
