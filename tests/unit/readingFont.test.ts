import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReadingFont, readingScript, READING_FONTS } from '../../src/fonts/readingFont.ts';
import { sanitizeEditorState } from '../../desktop/editorState.js';

test('font IDs are a closed allowlist; old documents preserve their local font and new readers get Source Serif', () => {
  assert.equal(resolveReadingFont(null), 'source-serif-4');
  assert.equal(resolveReadingFont({ content: '' }), 'local-jinkai');
  for (const readingFont of READING_FONTS) assert.equal(resolveReadingFont({ readingFont }), readingFont);
  for (const readingFont of ['url(https://evil.test/font)', '__proto__', null, 2]) {
    assert.equal(resolveReadingFont({ readingFont }), 'source-serif-4');
  }
});
test('desktop persists only recognized font IDs and accepts old state', () => {
  assert.deepEqual(sanitizeEditorState({ content: '' }), { content: '' });
  for (const readingFont of READING_FONTS) assert.equal(sanitizeEditorState({ content: '', readingFont }).readingFont, readingFont);
  assert.throws(() => sanitizeEditorState({ content: '', readingFont: 'arbitrary-font' }), /readingFont/);
});
test('reading rhythm is derived from document script, never interface language', () => {
  assert.equal(readingScript('A quiet space to read and think.'), 'latin');
  assert.equal(readingScript('日本語の文章。閱讀與思考。中文阅读。'), 'cjk');
  assert.equal(readingScript('Read 中文 and 日本語 alongside English prose.'), 'latin');
});
