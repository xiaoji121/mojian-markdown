import { test, expect } from './fixtures';

test('mobile reading menu retains focus and scroll; desktop has no mobile chrome', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  const source = await page.locator('.md-source').inputValue();
  await expect(page.locator('.mobile-reading-nav')).toBeVisible();
  await expect(page.locator('.reading-toolbar')).toBeHidden();
  const menuButton = page.locator('.app-header .mobile-menu-toggle');
  await menuButton.click();
  await expect(page.locator('.mobile-reading-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menuButton).toBeFocused();
  await menuButton.click();
  await page.locator('[data-mobile-action="focus"]').click();
  await expect(page.locator('.preview-pane-fullscreen')).toBeVisible();
  await page.locator('.md-preview').evaluate(el => { el.scrollTop = 250; });
  const scroll = await page.locator('.md-preview').evaluate(el => el.scrollTop);
  await page.locator('.mobile-focus-menu').click();
  await page.keyboard.press('Escape');
  expect(await page.locator('.md-preview').evaluate(el => el.scrollTop)).toBe(scroll);
  await expect(page.locator('.focus-exit-sticky')).toBeVisible();
  await page.locator('.focus-exit-sticky').click();
  await expect(page.locator('.md-source')).toHaveValue(source);
  await menuButton.click();
  await page.setViewportSize({ width: 761, height: 844 });
  await expect(page.locator('.mobile-reading-menu')).toBeHidden();
  await expect(page.locator('.mobile-reading-backdrop')).toBeHidden();
  await expect(page.locator('.mobile-reading-nav')).toBeHidden();
  await expect(page.locator('.view-mode-switcher')).toBeVisible();
  await expect(page.locator('.reading-toolbar')).toBeVisible();
});

test('mobile find and document filtering preserve document content', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  const source = await page.locator('.md-source').inputValue();
  await page.locator('.app-header .mobile-menu-toggle').click();
  await page.locator('[data-mobile-action="find"]').click();
  await page.locator('.preview-search-input').fill('not-in-this-document-123');
  await expect(page.locator('.preview-search-count')).toContainText('无结果');
  await page.locator('.preview-search-bar .search-close').click();
  await page.locator('.document-toggle').click();
  await page.locator('.workspace-document-search input').fill('not-in-this-document-123');
  await expect(page.locator('.recent-documents-empty')).toBeVisible();
  await page.locator('.workspace-document-search input').fill('');
  await expect(page.locator('.recent-document-item')).toHaveCount(1);
  await page.locator('.document-sidebar-close').click();
  await expect(page.locator('.md-source')).toHaveValue(source);
});

test('mobile export handoff stays open and returns focus to visible menu trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await expect(page.locator('.file-name')).toBeVisible();
  const opener = page.locator('.app-header .mobile-menu-toggle');
  await opener.click();
  await page.locator('[data-mobile-action="export"]').click();
  const menu = page.locator('.mobile-export-actions');
  await expect(menu).toBeVisible();
  await expect(menu.locator('button').first()).toBeFocused();
  await menu.locator('summary').click();
  for (const name of ['完整备份', 'Markdown 文件', '下载批注 Markdown', '长图', '复制全文+批注']) {
    await expect(menu.getByRole('button', { name, exact: false })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(opener).toBeFocused();
});

test('focus mode retains mobile outline, annotations and export access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#editor');
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await page.locator('.app-header .mobile-menu-toggle').click();
  await page.locator('[data-mobile-action="focus"]').click();
  await page.locator('.mobile-focus-menu').click();
  await expect(page.locator('[data-mobile-action="focus"]')).toContainText('退出专注');
  await page.locator('[data-mobile-action="outline"]').click();
  await expect(page.locator('.outline-panel')).toBeVisible();
  await page.locator('.outline-tree-item').first().click();
  await expect(page.locator('.outline-panel')).toBeHidden();
  await page.locator('.mobile-focus-menu').click();
  await page.locator('[data-mobile-action="comments"]').click();
  await expect(page.locator('.mobile-annotation-sheet')).toBeVisible();
  await page.locator('[data-mobile-close]').click();
  await page.locator('.mobile-focus-menu').click();
  await page.locator('[data-mobile-action="export"]').click();
  await expect(page.locator('.mobile-export-actions')).toBeVisible();
  await expect(page.locator('.mobile-export-actions button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mobile-focus-menu')).toBeFocused();
  await expect(page.locator('.preview-pane-fullscreen')).toBeVisible();
});

for (const width of [719, 720, 721, 759, 760]) {
  test(`mobile sheets clean up when resizing from ${width} to desktop`, async ({ page }) => {
    await page.setViewportSize({width, height: 844});
    await page.goto('/#editor');
    await expect(page.locator('.md-preview h1').first()).toBeVisible();
    await page.locator('.app-header .mobile-menu-toggle').click();
    await page.locator('[data-mobile-action="appearance"]').click();
    await expect(page.locator('.quick-appearance-panel')).toBeVisible();
    await page.setViewportSize({width: 761, height: 844});
    await expect(page.locator('.quick-appearance-panel')).toBeHidden();
    await expect(page.locator('.mobile-quick-appearance-backdrop')).toBeHidden();
    await page.keyboard.press('Control+,');
    await expect(page.locator('.workspace-settings')).toBeVisible();
    await page.setViewportSize({width: 760, height: 844});
    await expect(page.locator('.workspace-settings')).toBeHidden();
    await page.setViewportSize({width: 1440, height: 900});
    await expect(page.locator('.workspace-settings-backdrop')).toBeHidden();
    await expect(page.locator('.reading-toolbar')).toBeVisible();
  });
}
