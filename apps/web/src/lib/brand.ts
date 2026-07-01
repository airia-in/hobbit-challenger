export const BRAND_NAME = 'DRCODE';
export const BRAND_SUBTITLE = 'Discipline Challenge';
export const BRAND_TAGLINE = 'Daily tasks. Proof required. No exceptions.';
export const BRAND_DEFAULT_DESCRIPTION = BRAND_TAGLINE;
export const BRAND_DEFAULT_TITLE = `${BRAND_NAME} — ${BRAND_SUBTITLE}`;

export function formatPageTitle(page: string): string {
  return `${BRAND_NAME} — ${page}`;
}
