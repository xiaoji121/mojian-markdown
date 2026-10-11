import { test, expect, openMobileSetting } from './fixtures';

test('fresh mobile reading has no quick appearance backdrop blocking navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await expect(page.locator('.mobile-quick-appearance-backdrop')).toBeHidden();
  await expect(page.locator('.mobile-reading-menu')).toBeHidden();
  await expect(page.locator('.mobile-reading-backdrop')).toBeHidden();
  await page.locator('.mobile-reading-nav button').last().click();
  await expect(page.locator('.md-source')).toBeVisible();
});

for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 640, height: 400 }]) {
  test(`mobile settings form a touch-friendly bottom sheet at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/#editor');
    await expect(page.locator('.md-preview h1').first()).toBeVisible();
    const original = await page.locator('.md-source').inputValue();
    await page.keyboard.press('Control+,');
    const panel = page.locator('.workspace-settings');
    await expect(panel).toBeVisible();
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBe(0);
    expect(bounds.width).toBe(viewport.width);
    expect(bounds.y).toBeGreaterThan(0);
    expect(bounds.y + bounds.height).toBeCloseTo(viewport.height, 0);
    await expect(panel.locator('.appearance-width')).toBeHidden();
    await openMobileSetting(page, 'font');
    expect((await panel.locator('.reading-font-select').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await panel.locator('.reading-font-select').selectOption('system-serif');
    await openMobileSetting(page, 'paper');
    for (const button of await panel.locator('.font-inc,.paper-dot').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await panel.locator('.font-inc').click();
    await expect(page.locator('.md-preview')).toHaveCSS('font-size', '17px');
    await panel.locator('.paper-dot[data-paper="green"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-paper', 'green');
    await openMobileSetting(page, 'language');
    for (const locale of ['zh-TW', 'en', 'ja', 'zh-CN']) {
      const option = panel.locator(`[data-locale="${locale}"]`);
      expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await option.click();
      await expect(option).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.md-source')).toHaveValue(original);
    }
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('mobile-settings.png') });
    await panel.locator('.appearance-close').click();
    await expect(panel).toBeHidden();
    await expect(page.locator('.md-source')).toHaveValue(original);
  });
}

test('mobile quick appearance stays above reading and opens full settings without changing the document', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  const source = await page.locator('.md-source').inputValue();
  await page.locator('.mobile-menu-toggle:visible').click();
  await page.locator('.mobile-reading-menu [data-mobile-action="appearance"]').click();
  const quick = page.locator('.quick-appearance-panel');
  await expect(quick).toBeVisible();
  const bounds = (await quick.boundingBox())!;
  expect(bounds.x).toBe(0);
  expect(bounds.width).toBe(390);
  expect(bounds.y + bounds.height).toBeCloseTo(844, 0);
  for (const control of await quick.locator('button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await quick.getByRole('button', { name: '放大字号', exact: true }).click();
  await expect(quick.locator('.quick-font-value')).toHaveText('17px');
  await quick.locator('[data-paper="green"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-paper', 'green');
  await page.screenshot({ path: testInfo.outputPath('mobile-quick-appearance.png') });
  await quick.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(quick).toBeHidden();
  await expect(page.locator('.mobile-menu-toggle:visible')).toBeFocused();
  await page.locator('.mobile-menu-toggle:visible').click();
  await page.locator('.mobile-reading-menu [data-mobile-action="appearance"]').click();
  await quick.getByRole('button', { name: '完整设置', exact: true }).click();
  await expect(quick).toBeHidden();
  await expect(page.locator('.workspace-settings')).toBeVisible();
  await expect(page.locator('.font-size-value')).toHaveText('17px');
  await page.locator('.appearance-close').click();
  await expect(page.locator('.mobile-menu-toggle:visible')).toBeFocused();
  await expect(page.locator('.md-source')).toHaveValue(source);
});

test('desktop settings keep the original dialog and compact controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await page.keyboard.press('Control+,');
  const panel = page.locator('.workspace-settings');
  await expect(panel).toBeVisible();
  const bounds = (await panel.boundingBox())!;
  expect(bounds.width).toBe(820);
  expect(bounds.height).toBe(640);
  expect(bounds.x).toBe(310);
  await expect(panel.locator('.appearance-width')).toBeVisible();
  expect((await panel.locator('.font-inc').boundingBox())!.height).toBe(32);
  expect((await panel.locator('.paper-dot').first().boundingBox())!.height).toBe(24);
});
