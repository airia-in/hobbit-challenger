/** Max length for user habit-anchor text stored and passed to LLM prompts. */
export const HABIT_ANCHOR_TEXT_MAX_LENGTH = 80;

/**
 * Sanitize free-text user input before embedding in LLM prompts.
 * Strips newlines, template delimiters, and collapses whitespace.
 */
export function sanitizeUserPromptText(
  raw: string,
  maxLength = HABIT_ANCHOR_TEXT_MAX_LENGTH,
): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\{%[^%]*%\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
