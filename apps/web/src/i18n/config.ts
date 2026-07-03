export const locales = ['en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const fallbackLocale: Locale = defaultLocale;

export function isLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

export function getLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}
