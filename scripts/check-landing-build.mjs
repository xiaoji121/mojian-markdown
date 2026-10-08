import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const root = resolve('dist');
for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
  const file = resolve(root, locale, 'index.html');
  const html = readFileSync(file, 'utf8');
  assert.ok(html.includes(`<html lang="${locale}"`));
  assert.ok(html.includes(`rel="canonical" href="https://yuxizhai.com/md-editor/${locale}/"`));
  for (const name of ['og:title','og:description','og:url','og:image','twitter:title','twitter:description','twitter:image']) {
    assert.match(html, new RegExp(`(?:name|property)="${name}" content="[^\"]+"`));
  }
  for (const language of ['zh-CN','zh-TW','en','ja','x-default']) assert.ok(html.includes(`hreflang="${language}"`));
  assert.ok(html.includes('href="#editor"'));
  assert.ok(html.includes('href="../en/"'));
  for (const [, asset] of html.matchAll(/(?:src|href)="(\.\.\/assets\/[^\"]+)"/g)) {
    assert.ok(existsSync(resolve(dirname(file), asset)), `Missing asset ${asset}`);
  }
  assert.ok(!html.includes('<main id="landing-page"></main>'));
  console.log(`${locale}: static HTML metadata, landing content, locale links and bundled assets verified`);
}
const rootHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
assert.ok(rootHtml.includes('rel="canonical" href="https://yuxizhai.com/md-editor/"'));
assert.ok(rootHtml.includes('href="./en/"'));
