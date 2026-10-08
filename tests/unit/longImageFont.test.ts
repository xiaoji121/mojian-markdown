import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LongImageMethods } from '../../src/editor/longImageMethods.ts';

test('export resolves bundled font URLs relative to the stylesheet, not the document', async () => {
  let fetched = '';
  const context = { _fetchAsDataUrl: async (url: string) => { fetched = url; return 'data:font/woff2;base64,dGVzdA=='; } };
  const result = await LongImageMethods.prototype._inlineFontFace.call(context,
    '@font-face { font-family: test; src: url("./Roman.woff2"); }', 'https://example.test/app/assets/index.css');
  assert.equal(fetched, 'https://example.test/app/assets/Roman.woff2');
  assert.match(result, /data:font\/woff2;base64/);
});

test('rasterization never measures fallback-era height while fonts are still loading', async () => {
  const previous = globalThis.document;
  let release: () => void;
  let measured = false;
  globalThis.document = { fonts: { ready: new Promise<void>(resolve => { release = resolve; }) } } as any;
  try {
    const pending = LongImageMethods.prototype._rasterizePoster.call({}, {
      get offsetWidth() { measured = true; throw new Error('measurement reached'); }
    });
    const rejected = assert.rejects(pending, /measurement reached/);
    await Promise.resolve();
    assert.equal(measured, false);
    release!();
    await rejected;
    assert.equal(measured, true);
  } finally { globalThis.document = previous; }
});
