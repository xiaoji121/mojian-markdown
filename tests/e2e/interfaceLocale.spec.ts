import { test, expect, openEditor, setSource } from './fixtures';

const labels = {
  'zh-CN': { more: '更多操作', edit: '编辑', read: '阅读', setting: '阅读排版' },
  'zh-TW': { more: '更多操作', edit: '編輯', read: '閱讀', setting: '閱讀排版' },
  en: { more: 'More actions', edit: 'Edit', read: 'Read', setting: 'Reading appearance' },
  ja: { more: 'その他の操作', edit: '編集', read: '閲覧', setting: '閲覧設定' }
};
for (const [locale, text] of Object.entries(labels)) {
  test(`switch to ${locale} immediately and persist without changing the document`, async ({ page }, testInfo) => {
    await openEditor(page);
    const content = '# 中文文档 remains untouched\n\n保存 English 日本語\n\n<span data-i18n="保存" title="原文" data-i18n-title="保存">USER CONTENT</span>\n';
    await setSource(page, content);
    await page.locator('.interface-language').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('[data-mode=editor]')).toHaveText(text.edit);
    await expect(page.locator('[data-mode=preview]')).toHaveText(text.read);
    await expect(page.locator('.md-source')).toHaveValue(content);
    await expect(page.locator('.md-preview [data-i18n]')).toHaveText('USER CONTENT');
    await expect(page.locator('.md-preview [data-i18n]')).toHaveAttribute('title', '原文');
    await page.locator('.file-menu-toggle').click();
    await expect(page.locator('.file-menu')).toContainText(text.setting);
    await page.keyboard.press('Escape');
    await expect(page.locator('.file-menu-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('md-editor-warm-v1') || '{}').content)).toBe(content);
    await page.reload();
    await expect(page.locator('.interface-language')).toHaveValue(locale);
    await expect(page.locator('.md-source')).toHaveValue(content);
    await expect(page.locator('.md-preview [data-i18n]')).toHaveText('USER CONTENT');
    await expect(page.locator('.md-preview [data-i18n]')).toHaveAttribute('title', '原文');
    await expect(page.locator('[data-mode=editor]')).toHaveText(text.edit);
    await page.locator('.appearance-toggle').click();
    await expect(page.locator('#reading-appearance-panel')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`interface-${locale}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('first launch detects Japanese and unknown languages fall back to English', async ({ browser }) => {
  for (const [language, expected] of [['ja-JP', 'ja'], ['zh-HK', 'zh-TW'], ['fr-FR', 'en']]) {
    const context = await browser.newContext({ locale: language });
    await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto('http://localhost:4650/#editor');
    await expect(page.locator('.interface-language')).toHaveValue(expected);
    await context.close();
  }
});
