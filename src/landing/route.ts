export const landingLocales = ['zh-CN', 'zh-TW', 'en', 'ja'] as const;
export type LandingLocale = typeof landingLocales[number];
export function localeFromPath(path: string): LandingLocale | null {
  const segment = path.replace(/\/index\.html$/, '/').replace(/\/$/, '').split('/').pop();
  return landingLocales.find(locale => locale === segment) ?? null;
}
export function landingBase(path: string): string {
  const clean = path.replace(/index\.html$/, '');
  return localeFromPath(clean) ? clean.replace(/(?:zh-CN|zh-TW|en|ja)\/?$/, '') : clean.endsWith('/') ? clean : `${clean}/`;
}
export function localeHref(path: string, locale: string): string { return `${landingBase(path)}${locale}/`; }
