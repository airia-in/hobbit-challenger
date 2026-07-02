export const BRAND_NAME = 'HOBBIT';
export const BRAND_SUBTITLE = 'Habit buddy';
export const BRAND_TAGLINE = 'Here to annoy you into great habits.';
export const BRAND_INTRO =
  "Hi, I'm Hobbit — your habit buddy here to annoy you until today's tasks are done.";
export const BRAND_DEFAULT_DESCRIPTION = BRAND_TAGLINE;
export const BRAND_DEFAULT_TITLE = `${BRAND_NAME} — ${BRAND_SUBTITLE}`;

export function formatPageTitle(page: string): string {
  return `${BRAND_NAME} — ${page}`;
}
