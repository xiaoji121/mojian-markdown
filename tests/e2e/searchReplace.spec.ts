import { test, expect, openEditor, setSource, selectInSource } from './fixtures';

test('⌘F 打开搜索条，计数、循环跳转与 Esc 关闭', async ({ page }) => {
  await openEditor(page);
  await setSource(page, 'alpha beta\nalpha gamma\ndelta');
  await page.locator('.md-source').click();

  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('.search-bar')).toHaveClass(/is-open/);

  await page.getByRole('textbox', { name: '搜索文本' }).fill('alpha');
  await expect(page.locator('.search-count')).toHaveText('1/2');

  await page.keyboard.press('Enter');
  await expect(page.locator('.search-count')).toHaveText('2/2');

  await page.keyboard.press('Enter'); // 到末尾后回绕
  await expect(page.locator('.search-count')).toHaveText('1/2');

  await page.keyboard.press('Shift+Enter'); // 回绕到最后一处
  await expect(page.locator('.search-count')).toHaveText('2/2');

  await page.keyboard.press('Escape');
  await expect(page.locator('.search-bar')).not.toHaveClass(/is-open/);
  await expect(page.locator('.md-source')).toBeFocused();
});

test('选中文字后打开搜索会预填关键字', async ({ page }) => {
  await openEditor(page);
  await setSource(page, 'alpha beta alpha');
  await selectInSource(page, 'beta');

  await page.getByRole('button', { name: '搜索替换' }).click();

  await expect(page.getByRole('textbox', { name: '搜索文本' })).toHaveValue('beta');
  await expect(page.locator('.search-count')).toHaveText('1/1');
});

test('替换当前与全部替换，预览同步且可撤销', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# alpha\n\nalpha beta Alpha');

  await page.getByRole('button', { name: '搜索替换' }).click();
  await page.getByRole('textbox', { name: '搜索文本' }).fill('alpha');
  await expect(page.locator('.search-count')).toHaveText('1/3');
  await page.getByRole('textbox', { name: '替换文本' }).fill('omega');

  await page.getByRole('button', { name: '替换当前匹配' }).click();
  await expect(page.locator('.md-source')).toHaveValue('# omega\n\nalpha beta Alpha');
  await expect(page.locator('.md-preview h1')).toHaveText('omega');

  await page.getByRole('button', { name: '替换全部匹配' }).click();
  await expect(page.locator('.md-source')).toHaveValue('# omega\n\nomega beta omega');
  await expect(page.locator('.search-count')).toHaveText(/0\/0|^$/);

  // 每次替换都是独立的撤销条目
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.md-source')).toHaveValue('# omega\n\nalpha beta Alpha');
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.md-source')).toHaveValue('# alpha\n\nalpha beta Alpha');
});

test('区分大小写开关影响匹配数量', async ({ page }) => {
  await openEditor(page);
  await setSource(page, 'Alpha alpha ALPHA');

  await page.getByRole('button', { name: '搜索替换' }).click();
  await page.getByRole('textbox', { name: '搜索文本' }).fill('alpha');
  await expect(page.locator('.search-count')).toHaveText('1/3');

  await page.getByRole('button', { name: '区分大小写' }).click();
  await expect(page.locator('.search-count')).toHaveText('1/1');

  await page.getByRole('button', { name: '区分大小写' }).click();
  await expect(page.locator('.search-count')).toHaveText('1/3');
});
