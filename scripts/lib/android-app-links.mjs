export const ANDROID_PACKAGE_NAME = 'com.drcode.hobbit';

export const ASSETLINKS_RELATION = [
  'delegate_permission/common.handle_all_urls',
];

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

export function validateAssetLinksPayload(payload) {
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error('assetlinks.json must be a one-element array.');
  }

  const entry = payload[0];
  if (!entry || typeof entry !== 'object') {
    throw new Error('assetlinks.json entry must be an object.');
  }

  if (
    !Array.isArray(entry.relation) ||
    entry.relation.length !== 1 ||
    entry.relation[0] !== ASSETLINKS_RELATION[0]
  ) {
    throw new Error(
      'assetlinks.json relation must include delegate_permission/common.handle_all_urls.',
    );
  }

  const target = entry.target;
  if (!target || typeof target !== 'object') {
    throw new Error('assetlinks.json target must be an object.');
  }

  if (target.namespace !== 'android_app') {
    throw new Error('assetlinks.json target.namespace must be android_app.');
  }

  if (target.package_name !== ANDROID_PACKAGE_NAME) {
    throw new Error(
      `assetlinks.json target.package_name must be ${ANDROID_PACKAGE_NAME}.`,
    );
  }

  if (
    !Array.isArray(target.sha256_cert_fingerprints) ||
    target.sha256_cert_fingerprints.length === 0
  ) {
    throw new Error(
      'assetlinks.json target.sha256_cert_fingerprints must be non-empty.',
    );
  }

  for (const fingerprint of target.sha256_cert_fingerprints) {
    normalizeSha256Fingerprint(fingerprint);
  }
}

export function shouldRequireAssetLinksFingerprints() {
  const value =
    process.env.REQUIRE_ASSETLINKS_FINGERPRINTS?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}
