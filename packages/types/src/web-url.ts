export const DEFAULT_WEB_DOMAIN = 'hobbit.drcode.ai';
const DEFAULT_API_DOMAIN = 'hobbit-api.drcode.ai';

/** Strip an optional scheme and trailing slash from a hostname or URL fragment. */
export function normalizeWebDomain(webDomain: string): string {
  return webDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function buildDashboardUrl(webDomain = DEFAULT_WEB_DOMAIN): string {
  return `https://${normalizeWebDomain(webDomain)}/dashboard`;
}

export function buildApiUrl(apiDomain = DEFAULT_API_DOMAIN): string {
  return `https://${normalizeWebDomain(apiDomain)}`;
}

/** Production default for PUBLIC_API_URL (matches docker-compose API_DOMAIN). */
export const DEFAULT_PUBLIC_API_URL = buildApiUrl();
