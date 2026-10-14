import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLanding } from '../../src/landing/render.ts';
import { landingCopy } from '../../src/landing/copy.ts';

const locales = ['zh-CN', 'zh-TW', 'en', 'ja'] as const;
const shots = ['reading', 'toolbar', 'typography', 'split', 'mobile-reading', 'mobile-notes'];

for (const locale of locales) {
  test(`${locale} landing tells the reading-first story in order`, () => {
    const html = renderLanding(locale, '/');
    const order = ['landing-hero', 'id="read"', 'id="annotate"', 'id="split"', 'id="export"', 'id="anywhere"', 'id="faq"', 'landing-closing'];
    let last = -1;
    for (const marker of order) {
      const at = html.indexOf(marker);
      assert.ok(at > last, `${marker} should follow the previous section`);
      last = at;
    }
    assert.doesNotMatch(html, /<table/, 'the comparison table was removed from the design');
  });

  test(`${locale} landing shows localized product screenshots with dimensions and alt text`, () => {
    for (const [path, prefix] of [['/', './'], [`/md-editor/${locale}/`, '../']]) {
      const html = renderLanding(locale, path);
      for (const shot of shots) {
        const tag = html.match(new RegExp(`<img[^>]+src="${prefix.replace(/\./g, '\\.')}landing/${shot}-${locale}\\.webp"[^>]*>`))?.[0];
        assert.ok(tag, `${shot} screenshot for ${locale} at ${path}`);
        assert.match(tag, /alt="[^"]{6,}"/);
        assert.match(tag, /width="\d+" height="\d+"/);
      }
    }
    const html = renderLanding(locale, '/');
    assert.match(html, /<img[^>]+reading-[^"]+"[^>]*fetchpriority="high"/);
    assert.match(html, /<img[^>]+split-[^"]+"[^>]*loading="lazy"/);
  });

  test(`${locale} FAQ works without JavaScript and opens the first answer`, () => {
    const html = renderLanding(locale, '/');
    const faq = html.slice(html.indexOf('id="faq"'), html.indexOf('landing-closing'));
    const items = faq.match(/<details class="faq-item"[^>]*>/g) ?? [];
    assert.equal(items.length, 10);
    assert.match(items[0], /\sopen/);
    assert.equal(items.filter(item => /\sopen/.test(item)).length, 1);
    assert.equal((faq.match(/<summary/g) ?? []).length, 10);
  });

  test(`${locale} keeps the honest desktop test notice, collapsed and secondary`, () => {
    const html = renderLanding(locale, '/');
    const c = landingCopy[locale];
    const note = html.match(/<details id="desktop" class="landing-desktop-note">([\s\S]*?)<\/details>/)?.[1];
    assert.ok(note, 'desktop notice lives in a closed disclosure');
    assert.ok(html.indexOf('id="desktop"') > html.indexOf('id="anywhere"'));
    assert.ok(note.includes('SIGNING.md'));
    assert.ok(note.includes('TEST_INSTALLERS.md'));
    assert.ok(note.includes('npm run desktop'));
    for (const key of ['desktopBadge', 'desktopSigningNote'] as const) assert.ok(note.includes(c[key].slice(0, 12)));
  });
}

test('every locale ships the same copy keys', () => {
  const keys = Object.keys(landingCopy['zh-CN']).sort();
  for (const locale of locales) assert.deepEqual(Object.keys(landingCopy[locale]).sort(), keys);
  for (const locale of locales) assert.equal(landingCopy[locale].faq.length, 10);
});
