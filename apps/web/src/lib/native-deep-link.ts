import {
  DEFAULT_WEB_DOMAIN,
  normalizeWebDomain,
} from '@workspace-starter/types';

/**
 * Map an external invite/deep-link URL to an in-app path for the Capacitor WebView.
 * Only join invite URLs are accepted; mirrors Astro middleware and web-host static
 * redirect for legacy `/join/{token}` paths.
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

  if (parsed.protocol !== 'https:') {
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

  if (pathname === '/join') {
    const token = parsed.searchParams.get('token');
    if (!token) {
      return null;
    }
    return `/join?token=${encodeURIComponent(token)}`;
  }

  return null;
}
