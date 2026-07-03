import { useNativeDeepLinks } from '../lib/use-native-deep-links';

/** Invisible bootstrap for native deep-link routing (see use-native-deep-links). */
export function NativeDeepLinkBootstrap() {
  useNativeDeepLinks();
  return null;
}
