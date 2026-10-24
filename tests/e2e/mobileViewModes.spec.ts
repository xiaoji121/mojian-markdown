import { test, expect } from './fixtures';

// 手机屏幕放不下分屏：只保留「编辑 / 阅读」，进来默认阅读。

test.describe('手机只保留编辑与阅读', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('打开已有草稿时默认阅读，切到编辑后切换器没有分屏', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('md-editor-warm-v1', JSON.stringify({
      content: '# 草稿标题\n\n正文', fileName: '草稿.md', comments: []
    })));
    await page.goto('/#editor');
    await expect(page.locator('.md-preview h1').first()).toHaveText('草稿标题');
    await expect(page.locator('.editor-main')).toHaveClass(/preview-mode-active/);
    await expect(page.locator('.md-source')).toBeHidden();

    await page.locator('.mobile-reading-nav button').last().click();
    await expect(page.locator('.md-source')).toBeVisible();
    const switcher = page.locator('.view-mode-switcher');
    await expect(switcher.locator('[data-mode="editor"]')).toBeVisible();
    await expect(switcher.locator('[data-mode="preview"]')).toBeVisible();
    await expect(switcher.locator('[data-mode="split"]')).toBeHidden();

    await switcher.locator('[data-mode="preview"]').click();
    await expect(page.locator('.editor-main')).toHaveClass(/preview-mode-active/);
  });

  test('从桌面分屏缩到手机宽度时落到阅读', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/#editor');
    await expect(page.locator('.md-preview h1').first()).toBeVisible();
    await page.locator('.view-mode-option[data-mode="split"]').click();
    await expect(page.locator('.editor-main')).not.toHaveClass(/(editor|preview)-mode-active/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.editor-main')).toHaveClass(/preview-mode-active/);
  });
});
