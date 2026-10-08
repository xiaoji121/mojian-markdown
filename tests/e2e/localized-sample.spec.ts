import { chooseLanguage } from './localeHelpers';
import { test, expect, setSource } from './fixtures';

const samples = [
  { locale: 'zh-CN', title: '欢迎使用 Markdown 编辑器', name: '未命名.md' },
  { locale: 'zh-TW', title: '歡迎使用 Markdown 編輯器', name: '未命名.md' },
  { locale: 'en', title: 'Welcome to Mojian', name: 'Untitled.md' },
  { locale: 'ja', title: '墨笺へようこそ', name: '無題.md' }
];
for (const sample of samples) {
  test(`fresh ${sample.locale} sample follows detected language and survives UI changes`, async ({ page }, testInfo) => {
    await page.addInitScript(locale => {
      Object.defineProperty(navigator, 'language', { value: locale });
      Object.defineProperty(navigator, 'platform', { value: 'Win32' });
    }, sample.locale);
    await page.goto('/#editor');
    await expect(page.locator('.md-preview h1').first()).toHaveText(sample.title);
    await expect(page.locator('.md-source')).toHaveAttribute('lang', sample.locale);
    await expect(page.locator('.md-preview')).toHaveAttribute('lang', sample.locale);
    await expect(page.locator('.md-source')).toHaveValue(/Ctrl\+S/);
    await page.screenshot({ path: testInfo.outputPath(`sample-${sample.locale}.png`), fullPage: true });
    const initial = await page.locator('.md-source').inputValue();
    await chooseLanguage(page, sample.locale === 'en' ? 'ja' : 'en');
    await expect(page.locator('.md-source')).toHaveValue(initial);
    await expect(page.locator('.md-preview')).toHaveAttribute('lang', sample.locale);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('md-editor-warm-v1') || '{}'));
    expect(state.fileName).toBe(sample.name);
    await page.reload();
    await expect(page.locator('.md-source')).toHaveValue(initial);
    await setSource(page, initial + '\nUser note');
    await chooseLanguage(page, sample.locale);
    await expect(page.locator('.md-source')).toHaveValue(initial + '\nUser note');
    await expect(page.locator('.md-preview')).toHaveAttribute('lang', '');
  });
}
for (const content of ['', '# Saved document\nKeep <strong>my text</strong>']) {
  test(`preserve restored ${content ? 'document' : 'intentionally empty document'}`, async ({ page }) => {
    await page.addInitScript(content => {
      localStorage.setItem('md-editor-warm-v1', JSON.stringify({ content, locale: 'ja', fileName: 'mine.md' }));
    }, content);
    await page.goto('/#editor');
    await expect(page.locator('.md-source')).toBeVisible();
    await expect(page.locator('.md-source')).toHaveValue(content);
    await chooseLanguage(page, 'en');
    await expect(page.locator('.md-source')).toHaveValue(content);
    await expect(page.locator('.md-preview')).toHaveAttribute('lang', '');
  });
}
test('fresh macOS sample uses Command hints and renders escaped code literally', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'language', { value: 'en' });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
  });
  await page.goto('/#editor');
  await expect(page.locator('.md-source')).toHaveValue(/⌘S/);
  await expect(page.locator('.md-preview pre code')).toContainText('${name}');
  await expect(page.locator('.md-preview')).toHaveAttribute('contenteditable', 'false');
});

test('Back and Forward never reload a sample over edited content', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { location.hash = 'editor'; });
  await expect(page.locator('.md-source')).toBeVisible();
  await setSource(page, '# My reading notes\nKeep these notes.');
  await chooseLanguage(page, 'ja');
  await page.goBack();
  await page.goForward();
  await expect(page.locator('.md-source')).toHaveValue('# My reading notes\nKeep these notes.');
  await page.reload();
  await expect(page.locator('.md-source')).toHaveValue('# My reading notes\nKeep these notes.');
});
