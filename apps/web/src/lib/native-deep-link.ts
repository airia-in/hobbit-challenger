import {
  DEFAULT_WEB_DOMAIN,
  normalizeWebDomain,
} from '@workspace-starter/types';

/**
 * Map an external invite/deep-link URL to an in-app path for the Capacitor WebView.
 * Mirrors Astro middleware and web-host static redirect for legacy `/join/{token}` paths.
 */
export function resolveNativeDeepLinkTarget(
  url: string,
  webDomain = DEFAULT_WEB_DOMAIN,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = normalizeWebDomain(parsed.hostname);
  const expectedHost = normalizeWebDomain(webDomain);
  if (host !== expectedHost) {
    return null;
  }

  const pathname = parsed.pathname.replace(/\/$/, '') || '/';
  const joinMatch = pathname.match(/^\/join\/([^/]+)$/);
  if (joinMatch && joinMatch[1] !== '_') {
    return `/join?token=${encodeURIComponent(joinMatch[1])}`;
  }

  return `${pathname}${parsed.search}${parsed.hash}`;
}
