import { test, expect, openEditor, setSource } from './fixtures';

const ARTICLE = `# 长图导出

第一段正文，用来验证长图里的中文排版与预览一致。

## 小标题

- 列表第一项
- 列表第二项

> 引用块也要出现在长图里。

\`\`\`ts
const answer: number = 42;
\`\`\`

| 列 A | 列 B |
| --- | --- |
| 值 1 | 值 2 |
`;

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await setSource(page, ARTICLE);
});

test('长图弹窗按预览排版渲染海报，首个标题升格为海报标题', async ({ page }) => {
  await page.locator('.longimg-entry').click();

  const poster = page.locator('.longimg-poster');
  await expect(poster).toBeVisible();
  await expect(poster.locator('.longimg-title')).toHaveText('长图导出');
  await expect(poster.locator('.longimg-brand')).toHaveText('墨笺 Markdown');
  await expect(poster.locator('.longimg-meta')).toHaveText(/^\d+ 字 · \d{4}-\d{2}-\d{2}$/);
  // 正文保留其余结构，但不再重复渲染已升格的 h1
  await expect(poster.locator('.longimg-prose h1')).toHaveCount(0);
  await expect(poster.locator('.longimg-prose h2')).toHaveText('小标题');
  await expect(poster.locator('.longimg-prose li')).toHaveCount(2);
  await expect(poster.locator('.longimg-prose blockquote')).toBeVisible();

  // 排版与预览同源：正文字体栈就是阅读字体
  const previewFont = await page.locator('.md-preview').evaluate((el) => getComputedStyle(el).fontFamily);
  const posterFont = await poster.locator('.longimg-prose').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(posterFont).toBe(previewFont);
});

test('静态长图里表格与代码块折行，不靠横向滚动', async ({ page }) => {
  await page.locator('.longimg-entry').click();

  const overflow = await page.locator('.longimg-poster .longimg-prose').evaluate((prose) => {
    const table = prose.querySelector('table') as HTMLElement;
    const pre = prose.querySelector('pre') as HTMLElement;
    return {
      table: table.scrollWidth - table.clientWidth,
      pre: pre.scrollWidth - pre.clientWidth,
      preWrap: getComputedStyle(pre).whiteSpace
    };
  });

  expect(overflow.table).toBeLessThanOrEqual(1);
  expect(overflow.pre).toBeLessThanOrEqual(1);
  expect(overflow.preWrap).toBe('pre-wrap');
});

test('切换宽度档位后海报按新宽度重排', async ({ page }) => {
  await page.locator('.longimg-entry').click();
  const poster = page.locator('.longimg-poster');
  await expect(poster).toHaveCSS('width', '900px');

  await page.locator('[data-longimg-width="phone"]').click();

  await expect(page.locator('.longimg-poster')).toHaveCSS('width', '720px');
  await expect(page.locator('[data-longimg-width="phone"]')).toHaveAttribute('aria-pressed', 'true');
});

test('下载长图产出与海报同宽的 PNG', async ({ page }) => {
  await page.locator('.longimg-entry').click();
  await expect(page.locator('.longimg-poster')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.locator('.longimg-save').click()
  ]);

  expect(download.suggestedFilename()).toMatch(/^长图导出-\d{4}-\d{2}-\d{2}\.png$/);
  const path = await download.path();
  expect(path).toBeTruthy();

  // PNG 文件头里前 8 字节是签名，之后 IHDR 带宽高：标准宽度 900 × 2 倍输出
  const { readFileSync } = await import('node:fs');
  const buffer = readFileSync(path!);
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(buffer.readUInt32BE(16)).toBe(1800);
  expect(buffer.readUInt32BE(20)).toBeGreaterThan(1000);

  // 生成完成后弹窗自动收起，状态栏给出结果
  await expect(page.locator('.longimg-overlay')).toBeHidden();
  await expect(page.locator('.save-status')).toContainText('已保存长图');
});

test('关掉「含划线批注」后长图不带划线痕迹', async ({ page }) => {
  // 用真实鼠标手势在预览里划选一段，浮出划词工具条后打一条马克笔
  const paragraph = page.locator('.md-preview p').first();
  const box = (await paragraph.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(box.width - 4, 160), box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.selection-toolbar')).toBeVisible();
  await page.getByRole('button', { name: /马克笔/ }).click();
  await expect(page.locator('.md-preview [data-comment-id]')).toHaveCount(1);

  await page.locator('.longimg-entry').click();
  await expect(page.locator('.longimg-poster [data-comment-id]')).toHaveCount(1);

  await page.locator('.longimg-mark-toggle').click();

  await expect(page.locator('.longimg-poster [data-comment-id]')).toHaveCount(0);
  // 文字本身留在长图里，去掉的只是划线
  await expect(page.locator('.longimg-poster .longimg-prose p').first())
    .toContainText('第一段正文');
});
