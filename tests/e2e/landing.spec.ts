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

test('landing uses bundled licensed fonts without restricted or remote requests', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', request => {
    if (/cejk|canger|fonts\.(googleapis|gstatic)\.com/i.test(request.url())) fontRequests.push(request.url());
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('#landing-page').evaluate(landing => getComputedStyle(landing).fontFamily))
    .toContain('Mojian Local JinKai 04');
  expect(fontRequests).toEqual([]);
});

test('落地页背景贴合视口边缘，不出现浏览器默认白边', async ({ page }) => {
  await page.goto('/');

  const viewport = page.viewportSize();
  const landingBox = await page.locator('#landing-page').boundingBox();
  expect(viewport).not.toBeNull();
  expect(landingBox).not.toBeNull();
  expect(landingBox!.x).toBe(0);
  expect(landingBox!.width).toBe(viewport!.width);
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).margin)).toBe('0px');
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

test('落地页包含桌面端介绍区块', async ({ page }) => {
  await page.goto('/');

  const desktop = page.locator('#desktop');
  await expect(desktop).toBeVisible();
  await expect(desktop.locator('h2')).toHaveText(/桌面/);
  // Explicit desktop testing and optional AI requirements.
  await expect(desktop.locator('.edition-card')).toHaveCount(2);
  await expect(desktop).toContainText('测试');
  await expect(desktop).toContainText('AI 配置');
  await expect(desktop).toContainText('npm run desktop');
  // 完整版卡片提供跳转入口，且锚点真的落在桌面端区块（不被 hash 处理拉回顶部）
  await page.locator('#editions a[href="#desktop"]').click();
  await expect
    .poll(async () => {
      const box = await desktop.locator('h2').boundingBox();
      const viewport = page.viewportSize()!;
      return box !== null && box.y >= 0 && box.y < viewport.height;
    })
    .toBe(true);
});
