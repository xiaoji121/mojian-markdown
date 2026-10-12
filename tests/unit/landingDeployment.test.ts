import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMetadata } from '../../src/landing/render.ts';

test('custom domain metadata uses the configured root and all locale URLs', () => {
  for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
    const html = renderMetadata(locale, `/${locale}/`, 'https://mojian.uk/');
    assert.ok(html.includes(`rel="canonical" href="https://mojian.uk/${locale}/"`));
    assert.ok(html.includes('content="https://mojian.uk/og-image.png"'));
    assert.ok(!html.includes('yuxizhai.com'));
  }
  assert.ok(renderMetadata('zh-CN', '/', 'https://mojian.uk/').includes('rel="canonical" href="https://mojian.uk/"'));
});

test('legacy deployment remains the default', () => {
  assert.ok(renderMetadata('zh-CN', '/md-editor/').includes('rel="canonical" href="https://yuxizhai.com/md-editor/"'));
});
