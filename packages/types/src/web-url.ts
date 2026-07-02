const DEFAULT_WEB_DOMAIN = 'hobbit.drcode.ai';

/** Strip an optional scheme and trailing slash from a hostname or URL fragment. */
export function normalizeWebDomain(webDomain: string): string {
  return webDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function buildDashboardUrl(webDomain = DEFAULT_WEB_DOMAIN): string {
  return `https://${normalizeWebDomain(webDomain)}/dashboard`;
}
