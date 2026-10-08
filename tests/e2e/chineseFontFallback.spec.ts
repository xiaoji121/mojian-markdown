import { chooseLanguage } from './localeHelpers';
import { test, expect, openEditor, setSource, openAppearance } from './fixtures';
import type { Locator } from '@playwright/test';

const family = (locator: Locator) =>
  locator.evaluate(element => getComputedStyle(element).fontFamily);

for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
  test(`landing ${locale} uses its own script typography without changing editor preference`, async ({ page }, info) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('md-editor-warm-v1', JSON.stringify({
      content: '# Saved English document', readingFont: 'system-serif', locale: 'en'
    })));
    await page.goto(`/${locale}/`);
    const landing = page.locator('#landing-page');
    await expect(landing).toHaveAttribute('lang', locale);
    const stack = await family(landing);
    if (locale.startsWith('zh')) expect(stack.startsWith('"Mojian Local JinKai 04"')).toBe(true);
    else expect(stack.startsWith('"Source Serif 4"')).toBe(true);
    if (locale === 'ja') expect(stack).not.toContain('JinKai');
    expect(await family(page.locator('.landing-languages'))).not.toContain('JinKai');
    await page.evaluate(() => document.fonts.ready);
    // Font family order is a preference, not proof of a proprietary font being installed.
    const detected = await page.evaluate(async () => {
      try { await new FontFace('Local-only test probe', 'local("TsangerJinKai04-W04"), local("TsangerJinKai04 W04"), local("仓耳今楷04 W04")').load(); return 'available'; }
      catch { return 'not detected; system fallback rendered'; }
    });
    info.annotations.push({ type: 'local-jinkai', description: detected });
    await page.screenshot({ path: info.outputPath(`landing-font-${locale}.png`) });
    await page.locator('.landing-language-toggle').click();
    await page.locator('.landing-languages a[hreflang="zh-CN"]').click();
    await expect(page.locator('#landing-page')).toHaveAttribute('lang', 'zh-CN');
    expect(await family(page.locator('#landing-page'))).toContain('Mojian Local JinKai 04');
    await page.locator('.landing-language-toggle').click();
    await page.locator('.landing-languages a[hreflang="ja"]').click();
    await expect(page.locator('#landing-page')).toHaveAttribute('lang', 'ja');
    expect(await family(page.locator('#landing-page'))).not.toContain('JinKai');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('md-editor-warm-v1')!).readingFont)).toBe('system-serif');
    await page.locator('.landing-open').first().click();
    await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'system-serif');
  });
}

test('fresh Chinese startup and saved Source Serif retain local CJK fallback across UI changes', async ({ page }, info) => {
  await openEditor(page);
  await expect(page.locator('.md-preview')).toHaveAttribute('lang', 'zh-CN');
  expect(await family(page.locator('.md-preview'))).toContain('Mojian Local JinKai 04');
  await openAppearance(page);
  await page.locator('.reading-font-select').selectOption('source-serif-4');
  await page.keyboard.press('Escape');
  await setSource(page, '# English and 中文\n\nRead with **bold**, *italic* and `code()`. 中文阅读保留本机字体后备。');
  await chooseLanguage(page, 'ja');
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'source-serif-4');
  expect(await family(page.locator('.md-preview'))).toMatch(/Source Serif 4.*Mojian Local JinKai 04/);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'source-serif-4');
  expect(await family(page.locator('.md-preview'))).toMatch(/Source Serif 4.*Mojian Local JinKai 04/);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('saved-source-serif-mixed.png') });
});

test('Japanese sample uses Japanese fallback, while an explicit local choice is respected', async ({ page }) => {
  await page.goto('/ja/#editor');
  await expect(page.locator('.md-preview')).toHaveAttribute('lang', 'ja');
  expect(await family(page.locator('.md-preview'))).toContain('Yu Mincho');
  expect(await family(page.locator('.md-preview'))).not.toContain('JinKai');
  await openAppearance(page);
  await page.locator('.reading-font-select').selectOption('local-jinkai');
  expect(await family(page.locator('.md-preview'))).toContain('Mojian Local JinKai 04');
  await page.locator('.reading-font-select').selectOption('system-serif');
  expect(await family(page.locator('.md-preview'))).not.toContain('JinKai');
  await page.locator('.reading-font-select').selectOption('source-serif-4');
  await page.keyboard.press('Escape');
  await chooseLanguage(page, 'zh-CN');
  await expect(page.locator('.md-preview')).toHaveAttribute('lang', 'ja');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '导出长图', exact: true }).click();
  await expect(page.locator('.longimg-poster')).toBeVisible();
  expect(await family(page.locator('.longimg-poster'))).toEqual(await family(page.locator('.md-preview')));
  expect(await family(page.locator('.longimg-poster'))).not.toContain('JinKai');
});
