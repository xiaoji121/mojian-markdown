import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featureMessages } from '../../src/editor/locales/features.ts';

test('feature messages cover file, annotations, export and search in each locale', () => {
  assert.deepEqual(featureMessages['下载长图'], ['下載長圖', 'Download image', '画像をダウンロード']);
  assert.deepEqual(featureMessages['无结果'], ['無結果', 'No results', '結果なし']);
  assert.equal(featureMessages['已替换 {count} 处'][1], 'Replaced {count} matches');
  for (const [source, translations] of Object.entries(featureMessages)) {
    const parameters = source.match(/\{\w+\}/g)?.sort() || [];
    assert.equal(translations.length, 3);
    for (const translation of translations) {
      assert.ok(translation.trim());
      assert.deepEqual(translation.match(/\{\w+\}/g)?.sort() || [], parameters, source);
    }
  }
});

test('feature labels and search counts follow locale without changing user text', async () => {
  const { setLocale, getLocale } = await import('../../src/editor/i18n.ts');
  const { SearchReplaceMethods } = await import('../../src/editor/searchReplaceMethods.ts');
  const { CommentMethods } = await import('../../src/editor/commentMethods.ts');
  const { LONG_IMAGE_PRESETS } = await import('../../src/editor/longImageComposer.ts');
  const previous = getLocale();
  try {
    setLocale('en');
    assert.equal(SearchReplaceMethods.prototype._searchCountText.call({}, 1, 4, '原文'), '2 of 4');
    assert.equal(CommentMethods.prototype._typeLabel('idea'), 'Idea');
    assert.equal(LONG_IMAGE_PRESETS[0].label, 'Mobile');
    setLocale('ja');
    assert.equal(SearchReplaceMethods.prototype._searchCountText.call({}, 0, 0, '原文'), '結果なし');
    assert.equal(LONG_IMAGE_PRESETS[0].label, 'モバイル');
    setLocale('zh-TW');
    assert.equal(CommentMethods.prototype._typeLabel('marker'), '麥克筆');
  } finally { setLocale(previous); }
});
