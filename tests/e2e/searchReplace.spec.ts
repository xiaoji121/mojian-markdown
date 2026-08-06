import { test, expect, openEditor, setSource, selectInSource } from './fixtures';

test('⌘F 打开搜索条，计数、循环跳转与 Esc 关闭', async ({ page }) => {
  await openEditor(page);
  await setSource(page, 'alpha beta\nalpha gamma\ndelta');
  await page.locator('.md-source').click();

  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('.search-bar')).toHaveClass(/is-open/);

  await page.getByRole('textbox', { name: '搜索文本' }).fill('alpha');
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 2 项');

  await page.keyboard.press('Enter');
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 2 项，共 2 项');

  await page.keyboard.press('Enter'); // 到末尾后回绕
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 2 项');

  await page.keyboard.press('Shift+Enter'); // 回绕到最后一处
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 2 项，共 2 项');

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
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 1 项');
});

test('替换当前与全部替换，预览同步且可撤销', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# alpha\n\nalpha beta Alpha');

  await page.getByRole('button', { name: '搜索替换' }).click();
  await page.getByRole('textbox', { name: '搜索文本' }).fill('alpha');
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 3 项');
  await page.getByRole('button', { name: '展开或收起替换' }).click();
  await page.getByRole('textbox', { name: '替换文本' }).fill('omega');

  await page.getByRole('button', { name: '替换当前匹配' }).click();
  await expect(page.locator('.md-source')).toHaveValue('# omega\n\nalpha beta Alpha');
  await expect(page.locator('.md-preview h1')).toHaveText('omega');

  await page.getByRole('button', { name: '替换全部匹配' }).click();
  await expect(page.locator('.md-source')).toHaveValue('# omega\n\nomega beta omega');
  await expect(page.locator('.search-bar .search-count')).toHaveText(/无结果|^$/);

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
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 3 项');

  await page.getByRole('button', { name: '区分大小写' }).click();
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 1 项');

  await page.getByRole('button', { name: '区分大小写' }).click();
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 3 项');
});

test('预览模式下 ⌘F 打开预览搜索并用 Highlight API 高亮', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# 搜索\n\n第一段有目标词的内容。\n\n第二段也有目标词的内容。');
  await page.locator('.view-mode-option[data-mode="preview"]').click();

  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('.preview-search-bar')).toHaveClass(/is-open/);

  await page.getByRole('textbox', { name: '搜索预览' }).fill('目标词');
  await expect(page.locator('.preview-search-count')).toHaveText('第 1 项，共 2 项');
  expect(await page.evaluate(() => CSS.highlights.has('mojian-search'))).toBe(true);

  await page.keyboard.press('Enter');
  await expect(page.locator('.preview-search-count')).toHaveText('第 2 项，共 2 项');
  await page.keyboard.press('Enter');
  await expect(page.locator('.preview-search-count')).toHaveText('第 1 项，共 2 项');

  await page.keyboard.press('Escape');
  await expect(page.locator('.preview-search-bar')).not.toHaveClass(/is-open/);
  expect(await page.evaluate(() => CSS.highlights.has('mojian-search'))).toBe(false);
});

test('沉浸式阅读下可搜索，Esc 先关搜索再退出沉浸式', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# 沉浸\n\n沉浸式里的目标词。');
  await page.getByRole('button', { name: '沉浸式阅读' }).click();
  await expect(page.locator('.preview-pane')).toHaveClass(/preview-pane-fullscreen/);

  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('.preview-search-bar')).toHaveClass(/is-open/);
  await page.getByRole('textbox', { name: '搜索预览' }).fill('目标词');
  await expect(page.locator('.preview-search-count')).toHaveText('第 1 项，共 1 项');

  await page.keyboard.press('Escape');
  await expect(page.locator('.preview-search-bar')).not.toHaveClass(/is-open/);
  await expect(page.locator('.preview-pane')).toHaveClass(/preview-pane-fullscreen/, {
    timeout: 2000
  });

  await page.keyboard.press('Escape');
  await expect(page.locator('.preview-pane')).not.toHaveClass(/preview-pane-fullscreen/);
});

test('源码搜索在镜像层高亮全部匹配并标记当前项', async ({ page }) => {
  await openEditor(page);
  await setSource(page, 'alpha beta\nalpha gamma\nalpha delta');
  await page.locator('.md-source').click();

  await page.keyboard.press('ControlOrMeta+f');
  await page.getByRole('textbox', { name: '搜索文本' }).fill('alpha');

  const marks = page.locator('.source-highlight-layer mark.source-mark');
  await expect(marks).toHaveCount(3);
  await expect(page.locator('.source-highlight-layer mark.is-current')).toHaveCount(1);
  await expect(marks.first()).toHaveClass(/is-current/);

  await page.keyboard.press('Enter');
  await expect(marks.nth(1)).toHaveClass(/is-current/);

  await page.keyboard.press('Escape');
  await expect(page.locator('.source-highlight-layer mark')).toHaveCount(0);
});

test('全字匹配与正则开关（VS Code 风格内嵌按钮）', async ({ page }) => {
  await openEditor(page);
  await setSource(page, 'cat concat cat9 fat');
  await page.locator('.md-source').click();

  await page.keyboard.press('ControlOrMeta+f');
  await page.getByRole('textbox', { name: '搜索文本' }).fill('cat');
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 3 项');

  await page.getByRole('button', { name: '全字匹配' }).click();
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 1 项');
  await page.getByRole('button', { name: '全字匹配' }).click();

  await page.getByRole('button', { name: '使用正则表达式' }).click();
  await page.getByRole('textbox', { name: '搜索文本' }).fill('c.t|f.t');
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 4 项');

  await page.getByRole('textbox', { name: '搜索文本' }).fill('(未闭合');
  await expect(page.locator('.search-bar .search-count')).toHaveText('表达式无效');
});

test('软换行长段落中搜索能滚动定位到匹配处', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# 长段落\n\n' + 'word '.repeat(3000) + 'NEEDLE');
  await page.locator('.md-source').click();

  await page.keyboard.press('ControlOrMeta+f');
  await page.getByRole('textbox', { name: '搜索文本' }).fill('NEEDLE');
  await expect(page.locator('.search-bar .search-count')).toHaveText('第 1 项，共 1 项');

  const scrolled = await page.evaluate(() => document.querySelector('.md-source')!.scrollTop);
  expect(scrolled).toBeGreaterThan(500);
});
