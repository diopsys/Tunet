export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en', 'de'];

export function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

export function getLocaleForLanguage(language) {
  if (language === 'de') return 'de-DE';
  return 'en-US';
}
