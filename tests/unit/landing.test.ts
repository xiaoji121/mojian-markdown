import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLanding, renderMetadata, localeFromPath, localeHref } from '../../src/landing/render.ts';
for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
  test(`${locale} has readable no-JS content and complete share metadata`, () => {
    const html = renderLanding(locale, '/md-editor/');
    assert.match(html, /id="landing-page"/);
    assert.match(html, /href="#editor"/);
    assert.match(html, new RegExp(`hreflang="${locale}"[^>]+aria-current="page"`));
    const head = renderMetadata(locale, `/md-editor/${locale}/`);
    assert.match(head, new RegExp(`https://yuxizhai.com/md-editor/${locale}/`));
    for (const key of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(head.includes(key));
    for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'x-default']) assert.ok(head.includes(`hreflang="${lang}"`));
  });
}
test('locale routes support deployment base and preserve historic root', () => {
  assert.equal(localeFromPath('/md-editor/en/'), 'en');
  assert.equal(localeFromPath('/ja/index.html'), 'ja');
  assert.equal(localeFromPath('/md-editor/'), null);
  assert.equal(localeHref('/md-editor/en/', 'ja'), '/md-editor/ja/');
});
test('Vite dev fallback uses the original locale URL, not rewritten index.html', async () => {
  const { landingPages } = await import('../../scripts/landing-pages.ts');
  const plugin = landingPages();
  const transform = plugin.transformIndexHtml as { handler: Function };
  const html = '<html lang="zh-CN"><head><!-- landing-meta:start --><!-- landing-meta:end --></head><body><main id="landing-page"></main></body></html>';
  const localized = transform.handler(html, { path: '/index.html', originalUrl: '/ja/?source=test' });
  assert.match(localized, /<html lang="ja"/);
  assert.match(localized, /href="https:\/\/yuxizhai.com\/md-editor\/ja\/"/);
});

for (const [locale, autonym] of [['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'], ['ja', '日本語']]) {
  test(`${locale} keeps language links in a closed utility disclosure beside editor entry`, () => {
    const html = renderLanding(locale, `/md-editor/${locale}/`);
    const utility = html.match(/<div class="landing-nav-actions">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(utility, 'language and editor entry must share the right-side utility group');
    assert.match(utility, /<details class="landing-language-menu">/);
    assert.doesNotMatch(utility, /<details[^>]*\sopen(?:[\s=>])/);
    assert.match(utility, new RegExp(`<summary[^>]+class="landing-language-toggle"[^>]+aria-label="[^\"]+${autonym}"`));
    assert.match(utility, new RegExp(`<span[^>]+lang="${locale}"[^>]*>${autonym}<\\/span>`));
    assert.match(utility, /<svg[^>]+aria-hidden="true"/);
    assert.match(utility, /<nav class="landing-languages"[^>]+aria-label=/);
    assert.equal((utility.match(/hreflang=/g) ?? []).length, 4);
    assert.match(utility, /<\/details><a class="landing-button landing-open"/);
    for (const language of ['zh-CN', 'zh-TW', 'en', 'ja']) assert.ok(utility.includes(`href="../${language}/"`));
  });
}
