import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSample, sampleLanguage } from '../../src/editor/sample.ts';

for (const [locale, title, name] of [
  ['zh-CN', '欢迎使用 Markdown 编辑器', '未命名.md'],
  ['zh-TW', '歡迎使用 Markdown 編輯器', '未命名.md'],
  ['en', 'Welcome to Mojian', 'Untitled.md'],
  ['ja', '墨笺へようこそ', '無題.md']
] as const) {
  test(`${locale} sample has localized content, filename and platform shortcuts`, () => {
    const windows = getSample(locale, 'Win32');
    const mac = getSample(locale, 'MacIntel');
    assert.ok(windows.markdown.startsWith(`# ${title}\n`));
    assert.equal(windows.fileName, name);
    assert.ok(windows.markdown.includes('Ctrl+S'));
    assert.ok(!windows.markdown.includes('⌘'));
    assert.ok(mac.markdown.includes('⌘S'));
    assert.ok(!mac.markdown.includes('Ctrl+'));
    assert.equal(sampleLanguage(windows.markdown), locale);
    assert.equal(sampleLanguage(mac.markdown), locale);
    assert.equal(sampleLanguage(windows.markdown + '\nMy edit'), '');
    assert.ok(windows.markdown.includes('```js\n'));
    assert.ok(windows.markdown.includes('${name}'));
  });
}
test('unknown and empty documents have unknown language, independent of UI locale', () => {
  assert.equal(sampleLanguage(''), '');
  assert.equal(sampleLanguage('# My document'), '');
});
