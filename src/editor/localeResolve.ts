import { type Locale, detectLocale, isLocale } from './i18n.ts';

/**
 * Pick the editor UI locale.
 * Saved preference wins; otherwise follow landing (path segment, or historic
 * root = document lang / zh-CN); last resort is the browser language.
 */
export function resolveInitialLocale(input: {
  savedLocale?: unknown;
  pathLocale?: unknown;
  documentLang?: unknown;
  browserLanguage?: string;
  desktopLandingLocale?: unknown;
  isDesktop?: boolean;
}): Locale {
  if (isLocale(input.savedLocale)) return input.savedLocale;
  if (input.isDesktop && isLocale(input.desktopLandingLocale)) return input.desktopLandingLocale;
  if (isLocale(input.pathLocale)) return input.pathLocale;
  // Root landing has no locale segment and is historically Simplified Chinese.
  if (!input.isDesktop && (input.pathLocale === null || input.pathLocale === undefined)) {
    if (isLocale(input.documentLang)) return input.documentLang;
    return 'zh-CN';
  }
  return detectLocale(input.browserLanguage || '');
}
