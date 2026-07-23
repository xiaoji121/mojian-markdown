import { test, expect, openEditor, setSource, selectInSource } from './fixtures';

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await setSource(page, 'hello world');
});

test('工具栏加粗选区并可撤销、重做', async ({ page }) => {
  const source = page.locator('.md-source');
  await selectInSource(page, 'world');

  await page.locator('button[title="加粗"]').click();
  await expect(source).toHaveValue('hello **world**');
  await expect(page.locator('.md-preview strong')).toHaveText('world');

  await page.getByRole('button', { name: '撤销' }).click();
  await expect(source).toHaveValue('hello world');

  await page.getByRole('button', { name: '重做' }).click();
  await expect(source).toHaveValue('hello **world**');
});

test('快捷键在原文区触发撤销', async ({ page }) => {
  const source = page.locator('.md-source');
  await selectInSource(page, 'world');
  await page.locator('button[title="斜体"]').click();
  await expect(source).toHaveValue('hello *world*');

  await source.press('ControlOrMeta+z');
  await expect(source).toHaveValue('hello world');
});

test('引用与列表命令作用于整行', async ({ page }) => {
  const source = page.locator('.md-source');
  await selectInSource(page, 'hello');

  await page.locator('button[title="引用"]').click();
  await expect(source).toHaveValue('> hello world');
  await expect(page.locator('.md-preview blockquote')).toContainText('hello world');
});
