import { test, expect } from './fixtures';
import { chooseLanguage } from './localeHelpers';

test('mobile export has all five formats and separate saves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await expect(page.locator('.mobile-reading-nav')).not.toContainText('导出');
  await page.locator('.md-preview').evaluate(element => { element.scrollTop = 200; });
  const scroll = await page.locator('.md-preview').evaluate(element => element.scrollTop);
  const opener = page.locator('.app-header .mobile-menu-toggle');
  await opener.click();
  await page.locator('[data-mobile-action="export"]').click();
  const exports = page.locator('.mobile-export-actions');
  await expect(exports.locator('.mobile-export-primary button')).toHaveCount(3);
  for (const name of ['Markdown 文件', '长图', '完整备份']) await expect(exports.getByRole('button', { name, exact: false })).toBeVisible();
  const variants = exports.locator('details');
  await expect(variants.locator('summary')).toBeHidden();
  await expect(variants.locator('button')).toHaveCount(2);
  for (const button of await variants.locator('button').all()) await expect(button).toBeVisible();
  await exports.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('[data-mobile-action="export"]')).toBeFocused();
  await page.locator('[data-mobile-action="export"]').click();
  await expect(variants).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  expect(await page.locator('.md-preview').evaluate(element => element.scrollTop)).toBe(scroll);
});

test('mobile export labels remain localized in Traditional Chinese, English and Japanese', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  for (const [locale, labels] of [
    ['zh-TW', ['Markdown 檔案', '長圖', '完整備份']],
    ['en', ['Markdown file', 'Long image', 'Full backup']],
    ['ja', ['Markdown ファイル', '縦長画像', '完全バックアップ']]
  ] as const) {
    await chooseLanguage(page, locale);
    await page.locator('.app-header .mobile-menu-toggle').click();
    await page.locator('[data-mobile-action="export"]').click();
    for (const label of labels) await expect(page.locator('.mobile-export-primary').getByRole('button', { name: label, exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});
