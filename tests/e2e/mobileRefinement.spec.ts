import { test, expect } from './fixtures';

test('mobile hides AI and integrations while desktop restores their entries', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await page.locator('body').evaluate(element => element.classList.add('agent-bridge-enabled'));
  expect(await page.locator('.seltool.ai-entry').evaluate(element => getComputedStyle(element).display)).toBe('none');
  await page.keyboard.press('Control+,');
  for (const tab of ['ai', 'integrations']) await expect(page.locator(`[data-settings-tab="${tab}"]`)).toBeHidden();
  await expect(page.locator('.workspace-settings-nav')).toBeHidden();
  await page.locator('[data-mobile-setting="language"]').click();
  await expect(page.locator('.interface-language-option[aria-checked="true"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('.mobile-reading-nav button').first().click();
  await expect(page.locator('.outline-panel .ai-entry')).toBeHidden();
  await page.setViewportSize({ width: 761, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.press('Control+,');
  for (const tab of ['ai', 'integrations']) await expect(page.locator(`[data-settings-tab="${tab}"]`)).toBeVisible();
});

test('mobile navigation and menu use one SVG icon size with accessible targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  const trigger = page.locator('.app-header .mobile-menu-toggle');
  await expect(trigger.locator('svg')).toHaveAttribute('viewBox', '0 0 24 24');
  await trigger.click();
  for (const icon of await page.locator('.mobile-reading-menu svg').all()) {
    await expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
    await expect(icon).toHaveCSS('width', '20px');
    await expect(icon).toHaveCSS('height', '20px');
    await expect(icon).toHaveCSS('stroke-width', '1.8px');
  }
  expect(await page.locator('.mobile-reading-actions svg').count()).toBe(7);
  for (const button of await page.locator('.mobile-reading-actions button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
