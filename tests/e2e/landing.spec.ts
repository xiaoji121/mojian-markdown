import { test, expect } from './fixtures';

test('落地页首屏不预加载编辑器运行时', async ({ page }) => {
  const editorRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/src\/editor\/|\/react(?:-dom)?(?:\.js|\/)|\/marked(?:\.js|\/)/.test(request.url())) {
      editorRequests.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.locator('#landing-page')).toBeVisible();

  expect(editorRequests).toEqual([]);
});

test('编辑器运行时尚未加载时不暴露原始模板和 favicon', async ({ page }) => {
  await page.route('**/src/main.ts', (route) => route.abort());
  await page.goto('/#editor');

  await expect(page.locator('x-dc')).toBeHidden();
  await expect(page.locator('x-dc img[src="/favicon.svg"]')).toBeHidden();
});

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
