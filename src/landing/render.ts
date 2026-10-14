import { landingCopy } from './copy.ts';
import { landingLocales, localeFromPath } from './route.ts';
import { SITE_URL } from './site.ts';
export { localeFromPath, localeHref } from './route.ts';
export { SITE_URL } from './site.ts';
import { REPO, escapeHtml, heroSection, readSection, annotateSection, splitSection, exportSection, anywhereSection, faqSection, closingSection } from './sections.ts';
export { escapeHtml } from './sections.ts';
export function renderMetadata(locale: string, path = `/md-editor/${locale}/`, siteUrl = SITE_URL): string {
  const c = landingCopy[locale];
  const canonical = localeFromPath(path) ? `${siteUrl}${locale}/` : siteUrl;
  const meta = (key: string, value: string) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escapeHtml(value)}">`;
  return [`<title>${escapeHtml(c.title)}</title>`, meta('description', c.description),
    `<link rel="canonical" href="${canonical}">`,
    ...landingLocales.map(lang => `<link rel="alternate" hreflang="${lang}" href="${siteUrl}${lang}/">`),
    `<link rel="alternate" hreflang="x-default" href="${siteUrl}">`,
    meta('og:type','website'), meta('og:locale',locale.replace('-', '_').replace(/^en$/, 'en_US').replace(/^ja$/, 'ja_JP')),
    ...landingLocales.filter(lang => lang !== locale).map(lang => meta('og:locale:alternate', lang.replace('-', '_').replace(/^en$/, 'en_US').replace(/^ja$/, 'ja_JP'))),
    meta('og:site_name',c.brand), meta('og:title',c.title), meta('og:description',c.description), meta('og:url',canonical),
    meta('og:image',`${siteUrl}og-image.png`), meta('og:image:width','1200'), meta('og:image:height','630'), meta('og:image:alt',c.brand),
    meta('twitter:card','summary_large_image'), meta('twitter:title',c.title), meta('twitter:description',c.description), meta('twitter:image',`${siteUrl}og-image.png`), meta('twitter:image:alt',c.brand)
  ].join('\n');
}
export function renderLanding(locale: string, path = '/'): string {
  const c = landingCopy[locale];
  const e = escapeHtml;
  const labels = ['简体中文','繁體中文','English','日本語'];
  const languages = landingLocales.map((lang, i) => `<a href="${localeFromPath(path) ? '../' : './'}${lang}/" lang="${lang}" hreflang="${lang}"${lang === locale ? ' aria-current="page"' : ''}>${labels[i]}</a>`).join('');
  const currentLanguage = labels[landingLocales.findIndex(lang => lang === locale)];
  const languageMenu = `<details class="landing-language-menu"><summary class="landing-language-toggle" aria-label="${e(c.language)}: ${currentLanguage}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/></svg><span lang="${locale}">${currentLanguage}</span><svg class="landing-language-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4"/></svg></summary><nav class="landing-languages" aria-label="${e(c.language)}">${languages}</nav></details>`;
  const ctx = { c, locale, assets: localeFromPath(path) ? '../' : './' };
  return `<main id="landing-page" lang="${locale}">
  <nav class="landing-nav" aria-label="${e(c.brand)}"><a class="landing-brand" href="#"><span class="landing-brand-mark">墨</span><span class="landing-brand-name">${e(c.brand)}</span></a><div class="landing-nav-actions">${languageMenu}<a class="landing-button landing-open" href="#editor">${e(c.open)}</a></div></nav>
  ${heroSection(ctx)}
  ${readSection(ctx)}
  ${annotateSection(ctx)}
  ${splitSection(ctx)}
  ${exportSection(ctx)}
  ${anywhereSection(ctx)}
  ${faqSection(ctx)}
  ${closingSection(ctx)}
  <footer class="landing-wrap landing-footer"><span>© 2026 Dongming Ji</span><span>${e(c.footer)}</span><a class="landing-footer-link" href="${REPO}/blob/main/LICENSING.md">${e(c.license)} ↗</a></footer></main>`;
}
