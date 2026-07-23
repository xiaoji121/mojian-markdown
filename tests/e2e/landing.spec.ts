import { test, expect } from './fixtures';

test('落地页加载后可以进入编辑器', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#landing-page')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/editor-active/);

  await page.locator('.landing-nav .landing-button', { hasText: '打开编辑器' }).click();

  await expect(page.locator('body')).toHaveClass(/editor-active/);
  await expect(page.locator('#landing-page')).toBeHidden();
  await expect(page.locator('.md-source')).toBeVisible();
});

test('编辑器直链 #editor 可直接打开并渲染示例文档', async ({ page }) => {
  await page.goto('/#editor');

  await expect(page.locator('body')).toHaveClass(/editor-active/);
  await expect(page.locator('.md-source')).toHaveValue(/# 欢迎使用 Markdown 编辑器/);
  await expect(page.locator('.md-preview h1').first()).toHaveText('欢迎使用 Markdown 编辑器');
});
