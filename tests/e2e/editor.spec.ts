import { test, expect, openEditor, setSource } from './fixtures';

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
