import { test, expect, openEditor, setSource } from './fixtures';

const STORAGE_KEY = 'md-editor-warm-v1';

test('编辑内容自动保存，刷新后恢复', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# 持久化测试\n\n刷新后我还在。');

  // 自动保存有 600ms 防抖，等待内容真正写入 localStorage
  await page.waitForFunction(([key]) => {
    const raw = localStorage.getItem(key);
    return !!raw && JSON.parse(raw).content.includes('持久化测试');
  }, [STORAGE_KEY]);

  await page.reload();

  await expect(page.locator('.md-source')).toHaveValue('# 持久化测试\n\n刷新后我还在。');
  await expect(page.locator('.md-preview h1')).toHaveText('持久化测试');
});

test('主题选择在刷新后保持', async ({ page }) => {
  await openEditor(page);
  const body = page.locator('body');
  const initial = await body.getAttribute('data-theme');
  const other = initial === 'dark' ? 'light' : 'dark';

  await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
  await expect(body).toHaveAttribute('data-theme', other);
  await page.waitForFunction(([key, theme]) => {
    const raw = localStorage.getItem(key);
    return !!raw && JSON.parse(raw).theme === theme;
  }, [STORAGE_KEY, other]);

  await page.reload();
  await expect(body).toHaveAttribute('data-theme', other);
});
