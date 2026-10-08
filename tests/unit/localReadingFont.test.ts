import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectLocalReadingFont, LOCAL_READING_FONT_SOURCE, LOCAL_READING_FONT_FAMILY } from '../../src/fonts/localReadingFont.ts';

test('only loads local font names and confirms availability from successful load', async () => {
  let source = '';
  const result = await detectLocalReadingFont((family, value) => {
    assert.equal(family, LOCAL_READING_FONT_FAMILY);
    source = value;
    return { load: async () => ({}) };
  });
  assert.equal(result, 'available');
  assert.equal(source, LOCAL_READING_FONT_SOURCE);
  assert.ok(source.includes('local("TsangerJinKai04-W04")'));
  assert.ok(!/url\(|https?:/i.test(source));
});

test('missing or browser-hidden local font is unavailable, never falsely installed', async () => {
  assert.equal(await detectLocalReadingFont(() => ({ load: async () => { throw new Error('missing'); } })), 'unavailable');
});

test('unsupported browser or failed construction is unknown', async () => {
  assert.equal(await detectLocalReadingFont(null), 'unknown');
  assert.equal(await detectLocalReadingFont(() => { throw new Error('unsupported'); }), 'unknown');
});

test('a stalled font probe has a bounded unknown result', async () => {
  assert.equal(await detectLocalReadingFont(() => ({ load: () => new Promise(() => {}) }), 5), 'unknown');
});

test('shared CSS matches local-only probe and defaults without changing saved settings', () => {
  const css = readFileSync(new URL('../../src/theme/tokens.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`font-family: '${LOCAL_READING_FONT_FAMILY}'`));
  for (const name of LOCAL_READING_FONT_SOURCE.matchAll(/local\("([^"]+)"\)/g)) assert.ok(css.includes(`local("${name[1]}")`));
  assert.match(css, /--read: 'Mojian Local JinKai 04'/);
  const landing = readFileSync(new URL('../../src/landing.css', import.meta.url), 'utf8');
  assert.ok(!landing.includes('/fonts/canger-jinkai-04/'));
});


test('extension styles use local shared fonts without a packaged font request', () => {
  for (const file of ['reader.css', 'popup.css']) {
    const css = readFileSync(new URL('../../extension/src/' + file, import.meta.url), 'utf8');
    assert.ok(!css.includes('/fonts/cejk-subset.woff2'));
    assert.ok(css.includes("@import '../../src/theme/tokens.css'"));
  }
});
