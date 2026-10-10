import { test, expect, openEditor, setSource } from './fixtures';

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.setViewportSize({ width: 1280, height: 800 });
});

async function openOutline(page) {
  await page.getByRole('button', { name: '大纲', exact: true }).first().click();
  const panel = page.locator('.outline-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test('打开大纲侧栏可见全文标题树，右缘刻度默认隐藏', async ({ page }) => {
  await setSource(page, [
    '# 产品复盘',
    '',
    '开场正文。',
    '',
    '## 做对了什么',
    '',
    '第一部分内容。',
    '',
    '### 用户反馈',
    '',
    '反馈内容。',
    '',
    '## 下一步计划',
    '',
    '收尾内容。'
  ].join('\n'));

  await expect(page.locator('.outline-rail')).toHaveCount(0);
  const panel = await openOutline(page);
  const items = panel.locator('.outline-tree-item');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toHaveText('产品复盘');
  await expect(items.nth(1)).toHaveText('做对了什么');
  await expect(items.nth(2)).toHaveText('用户反馈');
  await expect(items.nth(3)).toHaveText('下一步计划');

  const levels = await items.evaluateAll((nodes) =>
    nodes.map((node) => Number((node as HTMLElement).dataset.outlineLevel)));
  expect(levels).toEqual([1, 2, 3, 2]);

  const indents = await items.evaluateAll((nodes) =>
    nodes.map((node) => parseFloat(getComputedStyle(node).paddingInlineStart)));
  expect(indents[1]).toBeGreaterThan(indents[0]);
  expect(indents[2]).toBeGreaterThan(indents[1]);
  expect(indents[3]).toBe(indents[1]);
});

test('点击大纲项跳转到对应标题，且不改写源文', async ({ page }) => {
  const markdown = [
    '# 开始',
    '',
    ...Array.from({ length: 18 }, (_, index) => `第 ${index + 1} 段正文，用来撑开阅读距离。`),
    '',
    '## 中段',
    '',
    ...Array.from({ length: 18 }, (_, index) => `中段第 ${index + 1} 段。`),
    '',
    '## 结尾',
    '',
    ...Array.from({ length: 8 }, (_, index) => `结尾第 ${index + 1} 段。`)
  ].join('\n\n');
  await setSource(page, markdown);
  const before = await page.locator('.md-source').inputValue();

  const panel = await openOutline(page);
  await panel.locator('.outline-tree-item[data-outline-title="中段"]').click();
  await expect(panel.locator('.outline-tree-item[data-outline-title="中段"]')).toHaveClass(/is-active/);
  await expect.poll(() => page.locator('.md-preview').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.locator('.md-source')).toHaveValue(before);
});

test('没有标题时大纲侧栏显示空状态', async ({ page }) => {
  await setSource(page, '这里只有正文，没有 Markdown 标题。');
  const panel = await openOutline(page);
  await expect(panel.locator('.outline-tree-empty')).toBeVisible();
  await expect(panel.locator('.outline-tree-empty')).toContainText('暂无标题');
  await expect(panel.locator('.outline-tree-item')).toHaveCount(0);
});

test('沉浸阅读下仍可打开大纲并跳转', async ({ page }) => {
  await setSource(page, [
    '# 开篇',
    '',
    ...Array.from({ length: 20 }, (_, i) => `段落 ${i + 1}。`),
    '',
    '## 目标节',
    '',
    '目标正文。'
  ].join('\n\n'));

  await page.getByRole('button', { name: '沉浸式阅读' }).click();
  await expect(page.locator('.editor-main')).toHaveClass(/preview-fullscreen-active/);
  await page.locator('.fullscreen-only-control[aria-label="大纲"]').click();
  const panel = page.locator('.outline-panel');
  await expect(panel).toBeVisible();
  await panel.locator('.outline-tree-item[data-outline-title="目标节"]').click();
  await expect(panel.locator('.outline-tree-item[data-outline-title="目标节"]')).toHaveClass(/is-active/);
  await expect.poll(() => page.locator('.md-preview').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});
