import { test, expect, openEditor, setSource } from './fixtures';

test('editor uses the complete local Canger reading font without remote fonts', async ({ page }) => {
  const remoteFontRequests: string[] = [];
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (request.resourceType() === 'font' || /cejk-subset\.woff2/.test(url)) fontRequests.push(url);
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) {
      remoteFontRequests.push(url);
    }
  });

  // beforeEach opened the editor before the request listener existed; reload so
  // this test observes the complete first-paint resource sequence.
  await page.reload();
  await expect(page.locator('.md-source')).toBeVisible();
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page.locator('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]')).toHaveCount(0);
  expect(remoteFontRequests).toEqual([]);
  expect(fontRequests).toHaveLength(1);
  expect(fontRequests[0]).toContain('/cejk-subset.woff2');
  expect(await page.locator('.md-preview').evaluate((element) => getComputedStyle(element).fontFamily))
    .toContain('Canger JinKai 04');
});

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test('输入 Markdown 后预览实时渲染', async ({ page }) => {
  await setSource(page, '# 端到端标题\n\n正文**加粗**内容。\n\n- 第一项\n- 第二项');

  const preview = page.locator('.md-preview');
  await expect(preview.locator('h1')).toHaveText('端到端标题');
  await expect(preview.locator('strong')).toHaveText('加粗');
  await expect(preview.locator('li')).toHaveCount(2);
});

test('字数统计跟随内容更新', async ({ page }) => {
  await setSource(page, '一二三\n四五');

  await expect(page.locator('.word-count')).toHaveText('5 字 · 2 行');
});

test('视图切换在编辑、分屏、预览三种布局间生效', async ({ page }) => {
  const main = page.locator('.editor-main');
  const source = page.locator('.md-source');
  const preview = page.locator('.md-preview');

  await page.locator('.view-mode-option[data-mode="editor"]').click();
  await expect(main).toHaveClass(/editor-mode-active/);
  await expect(source).toBeVisible();
  await expect(preview).toBeHidden();

  await page.locator('.view-mode-option[data-mode="preview"]').click();
  await expect(main).toHaveClass(/preview-mode-active/);
  await expect(preview).toBeVisible();
  await expect(source).toBeHidden();

  await page.locator('.view-mode-option[data-mode="split"]').click();
  await expect(main).not.toHaveClass(/editor-mode-active|preview-mode-active/);
  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();
});

test('主题切换写入 data-theme 并可来回切换', async ({ page }) => {
  const body = page.locator('body');
  const initial = await body.getAttribute('data-theme');
  const other = initial === 'dark' ? 'light' : 'dark';

  await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
  await expect(body).toHaveAttribute('data-theme', other);

  await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
  await expect(body).toHaveAttribute('data-theme', initial!);
});
