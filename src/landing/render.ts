import { landingCopy } from './copy.ts';
import { landingLocales, localeFromPath } from './route.ts';
import { SITE_URL } from './site.ts';
export { localeFromPath, localeHref } from './route.ts';
export { SITE_URL } from './site.ts';
const REPO = 'https://github.com/xiaoji121/mojian-markdown';
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
export function renderMetadata(locale: string, path = `/md-editor/${locale}/`): string {
  const c = landingCopy[locale];
  const canonical = path === '/md-editor/' ? SITE_URL : `${SITE_URL}${locale}/`;
  const meta = (key: string, value: string) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escapeHtml(value)}">`;
  return [`<title>${escapeHtml(c.title)}</title>`, meta('description', c.description),
    `<link rel="canonical" href="${canonical}">`,
    ...landingLocales.map(lang => `<link rel="alternate" hreflang="${lang}" href="${SITE_URL}${lang}/">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE_URL}">`,
    meta('og:type','website'), meta('og:locale',locale.replace('-', '_').replace(/^en$/, 'en_US').replace(/^ja$/, 'ja_JP')),
    ...landingLocales.filter(lang => lang !== locale).map(lang => meta('og:locale:alternate', lang.replace('-', '_').replace(/^en$/, 'en_US').replace(/^ja$/, 'ja_JP'))),
    meta('og:site_name',c.brand), meta('og:title',c.title), meta('og:description',c.description), meta('og:url',canonical),
    meta('og:image',`${SITE_URL}og-image.png`), meta('og:image:width','1200'), meta('og:image:height','630'), meta('og:image:alt',c.brand),
    meta('twitter:card','summary_large_image'), meta('twitter:title',c.title), meta('twitter:description',c.description), meta('twitter:image',`${SITE_URL}og-image.png`), meta('twitter:image:alt',c.brand)
  ].join('\n');
}
export function renderLanding(locale: string, path = '/'): string {
  const c = landingCopy[locale];
  const e = escapeHtml;
  const labels = ['简体中文','繁體中文','English','日本語'];
  const languages = landingLocales.map((lang, i) => `<a href="${localeFromPath(path) ? '../' : './'}${lang}/" lang="${lang}" hreflang="${lang}"${lang === locale ? ' aria-current="page"' : ''}>${labels[i]}</a>`).join('');
  const currentLanguage = labels[landingLocales.findIndex(lang => lang === locale)];
  const languageMenu = `<details class="landing-language-menu"><summary class="landing-language-toggle" aria-label="${e(c.language)}: ${currentLanguage}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/></svg><span lang="${locale}">${currentLanguage}</span><svg class="landing-language-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4"/></svg></summary><nav class="landing-languages" aria-label="${e(c.language)}">${languages}</nav></details>`;
  const tile = (number: string, title: string, body: string) => `<article class="workflow-item"><span>${number}</span><h3>${e(title)}</h3><p>${e(body)}</p></article>`;
  return `<main id="landing-page" lang="${locale}">
  <nav class="landing-nav" aria-label="${e(c.brand)}"><a class="landing-brand" href="#"><span class="landing-brand-mark">墨</span><span class="landing-brand-name">${e(c.brand)}</span></a><div class="landing-nav-actions">${languageMenu}<a class="landing-button landing-open" href="#editor">${e(c.open)}</a></div></nav>
  <section class="landing-hero"><div class="hero-product" aria-hidden="true"><div class="hero-source"><span class="pane-label">Markdown</span><pre># ${e(c.sampleHeading)}\n\n${e(c.sampleBody)}</pre></div><div class="hero-preview"><span class="pane-label">${e(c.previewLabel)}</span><h2>${e(c.sampleHeading)}</h2><p><mark>${e(c.sampleBody)}</mark></p><div class="comment-pop"><span>${e(c.sampleNote)}</span></div></div></div>
  <div class="landing-copy"><span class="landing-eyebrow">${e(c.eyebrow)}</span><h1>${e(c.brand)}</h1><p class="landing-lead">${e(c.lead)}</p><div class="landing-actions"><a class="landing-button primary" href="#editor">${e(c.tryBrowser)}</a><a class="landing-button ghost" href="${REPO}" target="_blank" rel="noopener noreferrer">${e(c.source)} ↗</a></div><p class="landing-demo-note">${e(c.browserNote)}</p></div></section>
  <section id="workflow" class="landing-section"><div class="landing-wrap"><div class="landing-section-head"><h2>${e(c.workflow)}</h2></div><div class="workflow-grid">${tile('01',c.editTitle,c.editBody)}${tile('02',c.annotateTitle,c.annotateBody)}${tile('03',c.saveTitle,c.saveBody)}</div></div></section>
  <section id="editions" class="landing-section"><div class="landing-wrap"><div class="landing-section-head"><h2>${e(c.editions)}</h2></div><div class="edition-grid"><article class="edition-card"><h3>${e(c.browserTitle)}</h3><p>${e(c.browserBody)}</p><a class="landing-button primary" href="#editor">${e(c.tryBrowser)}</a></article><article class="edition-card full"><h3>${e(c.localTitle)}</h3><p>${e(c.localBody)}</p><a class="landing-button" href="${REPO}#readme">${e(c.docsLink)} ↗</a><p><a href="#desktop">${e(c.desktopLink)} ↓</a></p></article></div></div></section>
  <section id="desktop" class="landing-section"><div class="landing-wrap"><div class="landing-section-head"><h2>${e(c.desktopTitle)}</h2><p class="landing-desktop-badge" role="status">${e(c.desktopBadge)}</p></div><div class="edition-grid"><article class="edition-card"><h3>${e(c.desktopTitle)}</h3><p>${e(c.desktopBody)}</p><p class="landing-signing-note">${e(c.desktopSigningNote)}</p><pre class="edition-code">npm install
npm run desktop</pre><p><a href="${REPO}/blob/main/docs/TEST_INSTALLERS.md">${e(c.desktopLink)} ↗</a></p><p><a href="${REPO}/blob/main/docs/SIGNING.md">${e(c.signingDocsLink)} ↗</a></p></article><article class="edition-card"><h3>${e(c.aiTitle)}</h3><p>${e(c.aiBody)}</p><a href="${REPO}#readme">${e(c.docsLink)} ↗</a></article></div></div></section>
  <footer class="landing-wrap landing-footer"><span>© 2026 Dongming Ji</span><span>${e(c.footer)}</span><a class="landing-footer-link" href="${REPO}/blob/main/LICENSING.md">${e(c.license)} ↗</a></footer></main>`;
}
