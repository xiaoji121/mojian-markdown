import { type Locale, detectLocale, isLocale } from './i18n.ts';

/**
 * Pick the editor UI locale.
 * Saved preference wins; then desktop landing; then an explicit path segment
 * (`/en/`, `/ja/`, …). Root `/` has no segment: only prefer the prerendered
 * landing locale when the user actually saw the landing before opening the
 * editor. A direct `/#editor` deep link (and E2E navigator fixtures) follow
 * the browser language instead of the static zh-CN document lang.
 */
export function resolveInitialLocale(input: {
  savedLocale?: unknown;
  pathLocale?: unknown;
  landingLocale?: unknown;
  preferLandingLocale?: boolean;
  browserLanguage?: string;
  desktopLandingLocale?: unknown;
  isDesktop?: boolean;
}): Locale {
  if (isLocale(input.savedLocale)) return input.savedLocale;
  if (input.isDesktop && isLocale(input.desktopLandingLocale)) return input.desktopLandingLocale;
  if (isLocale(input.pathLocale)) return input.pathLocale;
  if (!input.isDesktop && input.preferLandingLocale && isLocale(input.landingLocale)) {
    return input.landingLocale;
  }
  return detectLocale(input.browserLanguage || '');
}
