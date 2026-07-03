export const ANDROID_PACKAGE_NAME = 'com.drcode.hobbit';

export const ASSETLINKS_RELATION = [
  'delegate_permission/common.handle_all_urls',
] as const;

export interface AssetLinksEntry {
  relation: string[];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}
