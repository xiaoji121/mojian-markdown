import { test, expect } from './fixtures';

test('source caret and search remain intact across mobile sheets and desktop resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await page.locator('.mobile-reading-nav button').last().click();
  const source = page.locator('.md-source');
  await source.fill('# Synthetic sample\n\n' + 'A sample paragraph.\n\n'.repeat(60));
  await source.evaluate((element: HTMLTextAreaElement) => { element.focus(); element.setSelectionRange(30, 35); element.scrollTop = 200; });
  const original = await source.inputValue();
  await page.locator('.app-header .mobile-menu-toggle').click();
  await page.locator('[data-mobile-action="settings"]').click();
  await page.keyboard.press('Escape');
  expect(await source.evaluate((e: HTMLTextAreaElement) => [e.selectionStart,e.selectionEnd])).toEqual([30,35]);
  await page.locator('.app-header .mobile-menu-toggle').click();
  await page.locator('[data-mobile-action="find"]').click();
  await expect(page.locator('.search-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(source).toHaveValue(original);
  expect(await source.evaluate((e: HTMLTextAreaElement) => [e.selectionStart,e.selectionEnd])).toEqual([30,35]);
});

test('mobile export preserves desktop disk capabilities without executing writes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await page.evaluate(() => { window.mojianDesktop = {} as any; });
  await page.locator('.app-header .mobile-menu-toggle').click();
  await page.locator('[data-mobile-action="export"]').click();
  await expect(page.locator('.mobile-export-actions [data-mobile-write]')).toHaveCount(2);
  for (const button of await page.locator('.mobile-export-actions [data-mobile-write]').all()) await expect(button).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 900, height: 844 });
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '保存', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '另存为…', exact: true })).toBeVisible();
});
