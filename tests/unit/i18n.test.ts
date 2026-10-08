import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLocale, setLocale, getLocale, t, messages } from '../../src/editor/i18n.ts';
test('locale detection recognizes scripts and regions with an English fallback', () => {
  for (const [input, expected] of [['zh-CN', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh-Hant', 'zh-TW'], ['zh-HK', 'zh-TW'], ['zh-TW', 'zh-TW'], ['ja-JP', 'ja'], ['en-GB', 'en'], ['fr', 'en']]) assert.equal(detectLocale(input), expected);
});
test('all locales translate shell labels and interpolate without changing inserted content', () => {
  try {
    for (const [locale, label] of [['zh-CN', '语言'], ['zh-TW', '語言'], ['en', 'Language'], ['ja', '言語']]) {
      setLocale(locale); assert.equal(getLocale(), locale); assert.equal(t('语言'), label);
    }
    setLocale('en');
    assert.equal(t('跳到：{title}', {title: '中文 title <test>'}), 'Jump to: 中文 title <test>');
    assert.equal(t('unknown technical error'), 'unknown technical error');
    for (const [key, translations] of Object.entries(messages)) {
      assert.equal(translations.length, 3, key);
      const parameters = [...key.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
      for (const text of translations) {
        assert.ok(text.trim(), key);
        assert.deepEqual([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), parameters, key);
      }
    }
  } finally { setLocale('zh-CN'); }
});

test('long-image canvas limit reports a translated warning without throwing', async () => {
  const { LongImageMethods } = await import('../../src/editor/longImageMethods.ts');
  const element = { textContent: '' };
  try {
    setLocale('en');
    LongImageMethods.prototype._updateLongImageMeta.call({ _longImageMetaEl: element }, 1e12, 1e12);
    assert.match(element.textContent, /canvas|long|limit/i);
  } finally { setLocale('zh-CN'); }
});

test('user-authored i18n markers are excluded, only registered content controls may translate', async () => {
  const { isTranslatableChrome, registerOwnedChrome } = await import('../../src/editor/localeChrome.ts');
  const userNode = { closest: () => ({}) } as any;
  const chromeNode = { closest: () => null } as any;
  assert.equal(isTranslatableChrome(userNode), false);
  assert.equal(isTranslatableChrome(chromeNode), true);
  registerOwnedChrome(userNode);
  assert.equal(isTranslatableChrome(userNode), true);
});
