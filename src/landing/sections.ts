import type { LandingCopy } from './copy.ts';

export const REPO = 'https://github.com/xiaoji121/mojian-markdown';
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
// Copy marks the accent phrase with *asterisks* and line breaks with \n.
export const rich = (value: string) => escapeHtml(value).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

// Intrinsic sizes of the shipped screenshots in public/landing (CSS scales them).
const SHOT_SIZE: Record<string, [number, number]> = {
  reading: [2400, 1500], split: [2400, 1500], toolbar: [1600, 808], typography: [960, 500],
  'mobile-reading': [780, 1688], 'mobile-notes': [780, 1688],
};

export type SectionContext = { c: LandingCopy; locale: string; assets: string };

export function shot(ctx: SectionContext, name: string, alt: string, className: string, eager = false) {
  const [width, height] = SHOT_SIZE[name];
  const loading = eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  return `<img class="${className}" src="${ctx.assets}landing/${name}-${ctx.locale}.webp" alt="${escapeHtml(alt)}" width="${width}" height="${height}" ${loading}>`;
}

const mark = (label: string) => `<p class="landing-mark">${escapeHtml(label)}</p>`;
const point = (text: string) => `<li>${escapeHtml(text)}</li>`;

export function heroSection(ctx: SectionContext) {
  const { c } = ctx;
  return `<section class="landing-hero"><div class="landing-copy landing-narrow">${mark(c.eyebrow)}<h1>${rich(c.heroTitle)}</h1><p class="landing-lead">${escapeHtml(c.heroLead)}</p><div class="landing-actions"><a class="landing-button primary" href="#editor">${escapeHtml(c.tryBrowser)}</a><a class="landing-button ghost" href="${REPO}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.source)} ↗</a></div><p class="landing-demo-note">${escapeHtml(c.heroNote)}</p></div>
  <div class="landing-wrap hero-shot"><div class="hero-product">${shot(ctx, 'reading', c.altReading, 'landing-shot', true)}</div><div class="hero-product-mobile">${shot(ctx, 'mobile-reading', c.altMobileReading, 'landing-phone')}</div></div>
  <div class="landing-wrap pillar-grid">${[[c.pillarReadTitle, c.pillarReadBody], [c.pillarNotesTitle, c.pillarNotesBody], [c.pillarExportTitle, c.pillarExportBody]].map(([title, body], i) => `<article class="pillar${i === 1 ? ' is-key' : ''}"><span class="pillar-num">0${i + 1}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`).join('')}</div></section>`;
}

export function readSection(ctx: SectionContext) {
  const { c } = ctx;
  const papers: [string, string][] = [['#1c1a17', c.paperInk], ['#f9ebcc', c.paperParchment], ['#f0e9d1', c.paperCream], ['#ffffff', c.paperWhite], ['#c0edc6', c.paperGreen]];
  const swatches = papers.map(([color, name]) => `<li><span class="paper-swatch" style="background:${color}"></span>${escapeHtml(name)}</li>`).join('');
  return `<section id="read" class="landing-section"><div class="landing-wrap landing-split"><div>${mark(c.readMark)}<h2>${rich(c.readTitle)}</h2><p class="landing-body">${escapeHtml(c.readBody)}</p><ul class="paper-list">${swatches}</ul><ul class="landing-points">${point(c.readPoint1)}${point(c.readPoint2)}${point(c.readPoint3)}</ul></div>
  <figure class="landing-figure">${shot(ctx, 'typography', c.altTypography, 'landing-shot')}</figure></div></section>`;
}

export function annotateSection(ctx: SectionContext) {
  const { c } = ctx;
  const sample = { 'zh-CN': '欢迎', 'zh-TW': '歡迎', en: 'Welcome', ja: 'ようこそ' }[ctx.locale] ?? 'Welcome';
  const file = (name: string, note: string, key = false) => `<li${key ? ' class="is-key"' : ''}><code>${escapeHtml(name)}</code><span>${escapeHtml(note)}</span></li>`;
  return `<section id="annotate" class="landing-section tinted"><div class="landing-wrap landing-split reverse"><figure class="landing-figure">${shot(ctx, 'toolbar', c.altToolbar, 'landing-shot')}<figcaption>${escapeHtml(c.annotateCaption)}</figcaption></figure>
  <div>${mark(c.annotateMark)}<h2>${rich(c.annotateTitle)}</h2><p class="landing-body">${escapeHtml(c.annotateBody)}</p><ul class="file-list">${file(`${sample}.md`, c.fileSource)}${file(`${sample}.annotations.md`, c.fileNotes, true)}${file(`${sample}.annotations.json`, c.fileJson, true)}</ul><p class="landing-small">${escapeHtml(c.annotatePanel)}</p></div></div></section>`;
}

export function splitSection(ctx: SectionContext) {
  const { c } = ctx;
  const mode = (name: string, body: string) => `<li><strong>${escapeHtml(name)}</strong> · ${escapeHtml(body)}</li>`;
  return `<section id="split" class="landing-section"><div class="landing-wrap"><div class="landing-intro">${mark(c.splitMark)}<h2>${rich(c.splitTitle)}</h2><p class="landing-body">${escapeHtml(c.splitBody)}</p></div>
  <figure class="landing-figure wide">${shot(ctx, 'split', c.altSplit, 'landing-shot')}</figure><ul class="mode-list">${mode(c.modeEdit, c.modeEditBody)}${mode(c.modeSplit, c.modeSplitBody)}${mode(c.modeRead, c.modeReadBody)}</ul></div></section>`;
}

export function exportSection(ctx: SectionContext) {
  const { c } = ctx;
  const card = (ext: string, title: string, body: string) => `<article class="export-card"><code>${ext}</code><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`;
  return `<section id="export" class="landing-section tinted"><div class="landing-wrap"><div class="landing-intro">${mark(c.exportMark)}<h2>${rich(c.exportTitle)}</h2><p class="landing-body">${escapeHtml(c.exportBody)}</p></div>
  <div class="export-grid">${card('.png', c.exportImageTitle, c.exportImageBody)}${card('.annotations.md · .json', c.exportNotesTitle, c.exportNotesBody)}${card('.zip', c.exportZipTitle, c.exportZipBody)}</div></div></section>`;
}

export function anywhereSection(ctx: SectionContext) {
  const { c } = ctx;
  const desktop = `<details id="desktop" class="landing-desktop-note"><summary>${escapeHtml(c.desktopSummary)} <span class="landing-desktop-badge">${escapeHtml(c.desktopBadge)}</span></summary><p>${escapeHtml(c.desktopBody)}</p><p class="landing-signing-note">${escapeHtml(c.desktopSigningNote)}</p><p>${escapeHtml(c.desktopRun)}</p><pre class="landing-code">npm install
npm run desktop</pre><p><a href="${REPO}/blob/main/docs/TEST_INSTALLERS.md">${escapeHtml(c.desktopLink)} ↗</a> · <a href="${REPO}/blob/main/docs/SIGNING.md">${escapeHtml(c.signingDocsLink)} ↗</a></p></details>`;
  return `<section id="anywhere" class="landing-section"><div class="landing-wrap landing-split"><div>${mark(c.anywhereMark)}<h2>${rich(c.anywhereTitle)}</h2><p class="landing-body">${escapeHtml(c.anywhereBody)}</p><ul class="landing-points">${point(c.anywherePoint1)}${point(c.anywherePoint2)}${point(c.anywherePoint3)}${point(c.anywherePoint4)}</ul>${desktop}</div>
  <div class="phone-pair">${shot(ctx, 'mobile-reading', c.altMobileReading, 'landing-phone')}${shot(ctx, 'mobile-notes', c.altMobileNotes, 'landing-phone offset')}</div></div></section>`;
}

export function faqSection({ c }: SectionContext) {
  const items = c.faq.map(([question, answer], i) => `<details class="faq-item"${i === 0 ? ' open' : ''}><summary><span class="faq-num">${String(i + 1).padStart(2, '0')}</span><span class="faq-question">${escapeHtml(question)}</span></summary><p class="faq-answer">${escapeHtml(answer)}</p></details>`).join('');
  return `<section id="faq" class="landing-section tinted"><div class="landing-wrap faq-layout"><div>${mark(c.faqMark)}<h2>${rich(c.faqTitle)}</h2><p class="landing-body">${escapeHtml(c.faqBody)}</p><a class="landing-button ghost" href="${REPO}/issues" target="_blank" rel="noopener noreferrer">${escapeHtml(c.faqAsk)} ↗</a><aside class="faq-tldr"><p class="faq-tldr-label">${escapeHtml(c.faqTldrLabel)}</p><p>${escapeHtml(c.faqTldr)}</p></aside></div>
  <div class="faq-list">${items}</div></div></section>`;
}

export function closingSection({ c }: SectionContext) {
  return `<section class="landing-section landing-closing"><div class="landing-narrow"><h2>${rich(c.closingTitle)}</h2><p class="landing-body">${escapeHtml(c.closingBody)}</p><div class="landing-actions"><a class="landing-button primary" href="#editor">${escapeHtml(c.tryBrowser)}</a><a class="landing-button ghost" href="${REPO}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.closingSource)} ↗</a></div></div></section>`;
}
