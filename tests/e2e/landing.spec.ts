import { test, expect, ensureSourceVisible } from './fixtures';

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
  await ensureSourceVisible(page);
});

test('编辑器直链 #editor 可直接打开并渲染示例文档', async ({ page }) => {
  await page.goto('/#editor');

  await expect(page.locator('body')).toHaveClass(/editor-active/);
  await ensureSourceVisible(page);
  await expect(page.locator('.md-source')).toHaveValue(/# 欢迎使用墨笺/);
  await expect(page.locator('.md-preview h1').first()).toHaveText('欢迎使用墨笺');
});

test('落地页保留桌面测试版说明，但收起为次要信息', async ({ page }) => {
  await page.goto('/');

  const desktop = page.locator('#desktop');
  const summary = desktop.locator('summary');
  await summary.scrollIntoViewIfNeeded();
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('未正式签名');
  await expect(desktop.locator('a[href*="SIGNING.md"]')).toBeHidden();
  await summary.click();
  await expect(desktop).toHaveAttribute('open', '');
  await expect(desktop).toContainText('Gatekeeper');
  await expect(desktop).toContainText('npm run desktop');
  await expect(desktop.locator('a[href*="SIGNING.md"]')).toBeVisible();
  // Optional AI setup stays documented in the FAQ instead of a headline section.
  await expect(page.locator('#faq')).toContainText('API 密钥');
});

test('落地页常见问题无需脚本即可展开', async ({ page }) => {
  await page.goto('/');
  const items = page.locator('#faq .faq-item');
  await expect(items).toHaveCount(10);
  await expect(items.first()).toHaveAttribute('open', '');
  await items.nth(2).locator('summary').click();
  await expect(items.nth(2)).toHaveAttribute('open', '');
  await expect(items.nth(2).locator('.faq-answer')).toBeVisible();
});

test('落地页产品截图加载成功且不撑破窄屏', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const img of await page.locator('#landing-page img').all()) {
      if (!(await img.isVisible())) continue;
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
