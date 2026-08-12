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

  const headLayout = await page.evaluate(() => {
    const hint = document.querySelector('.longimg-modal-hint')!.getBoundingClientRect();
    const stage = document.querySelector('.longimg-stage-wrap')!.getBoundingClientRect();
    return { hintBottom: hint.bottom, hintHeight: hint.height, stageTop: stage.top };
  });
  expect(headLayout.hintBottom).toBeLessThanOrEqual(headLayout.stageTop);
  expect(headLayout.hintHeight).toBeLessThan(25);

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

test('长图预览跟随当前阅读纸张颜色', async ({ page }) => {
  await page.locator('.paper-dot[data-paper="green"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-paper', 'green');
  await page.locator('.longimg-entry').click();

  const colors = await page.evaluate(() => ({
    preview: getComputedStyle(document.querySelector('.md-preview')!).backgroundColor,
    poster: getComputedStyle(document.querySelector('.longimg-poster')!).backgroundColor,
    snapshot: (document.querySelector('.longimg-poster') as HTMLElement).style.getPropertyValue('--paper-bg')
  }));

  expect(colors.preview).toBe('rgb(213, 228, 208)');
  expect(colors.poster).toBe(colors.preview);
  expect(colors.snapshot).toBe('#d5e4d0');
});

test('划词工具条可把选中内容单独生成图片', async ({ page }) => {
  await page.locator('.md-preview').evaluate((preview) => {
    const items = preview.querySelectorAll('li');
    const range = document.createRange();
    range.setStart(items[0], 0);
    range.setEnd(items[1], items[1].childNodes.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    preview.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  });
  await expect(page.locator('.selection-toolbar')).toBeVisible();

  await page.locator('.selection-image-entry').click();

  const poster = page.locator('.longimg-poster');
  await expect(poster).toBeVisible();
  await expect(poster).toContainText('列表第一项');
  await expect(poster).toContainText('列表第二项');
  await expect(poster.locator('.longimg-prose > ul > li')).toHaveCount(2);
  await expect(poster).not.toContainText('引用块也要出现在长图里');
  await expect(poster.locator('.longimg-title')).toHaveText('摘录');
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

test('切换手机档后使用更宽的社交版心，并把小字号提升到 22px', async ({ page }) => {
  await page.locator('.longimg-entry').click();
  const poster = page.locator('.longimg-poster');
  await expect(poster).toHaveCSS('width', '900px');
  await expect(page.locator('.longimg-crop-toggle')).toBeHidden();
  const marks = page.locator('.longimg-modal-head .longimg-mark-toggle');
  await expect(marks).toBeVisible();
  await expect(marks).toHaveAttribute('role', 'switch');
  await expect(marks).toHaveAttribute('aria-checked', 'true');

  await page.locator('[data-longimg-width="phone"]').click();

  await expect(page.locator('.longimg-poster')).toHaveCSS('width', '1080px');
  await expect(page.locator('.longimg-poster')).toHaveCSS('font-size', '22px');
  await expect(page.locator('.font-size-value')).toHaveText('22px');
  await expect(page.locator('[data-longimg-width="phone"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.longimg-crop-toggle')).toBeVisible();
});

test('手机分页把长文保存为多张一屏尺寸图片', async ({ page }) => {
  const sections = Array.from({ length: 14 }, (_, index) =>
    `## 第 ${index + 1} 节\n\n这是用于手机分页验证的一段正文。内容需要保持清晰易读，并在安全位置换页。`
  ).join('\n\n');
  await setSource(page, '# 手机分页测试\n\n' + sections);
  await page.locator('.longimg-entry').click();
  await page.locator('[data-longimg-width="phone"]').click();
  await page.locator('.longimg-crop-toggle').click();

  await expect(page.locator('[data-longimg-width="phone"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.longimg-crop-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.longimg-save')).toHaveText('下载多图');
  const previews = page.locator('.longimg-page-preview');
  expect(await previews.count()).toBeGreaterThan(1);
  await expect(previews.first()).toHaveCSS('width', '1080px');
  await expect(previews.first()).toHaveCSS('height', '1440px');
  await expect(previews.first().locator('.longimg-page-number')).toContainText('1 /');
  const splitLines = await previews.evaluateAll((pageNodes) => pageNodes.flatMap((page, pageIndex) => {
    const viewport = page.querySelector('.longimg-page-viewport')!;
    const boundary = viewport.getBoundingClientRect();
    const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT);
    const broken: string[] = [];
    let node = walker.nextNode();
    while (node) {
      if ((node.nodeValue || '').trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          const crossesTop = rect.top < boundary.top - 0.5 && rect.bottom > boundary.top + 0.5;
          const crossesBottom = rect.top < boundary.bottom - 0.5 && rect.bottom > boundary.bottom + 0.5;
          if (crossesTop || crossesBottom) broken.push(`${pageIndex + 1}:${node.nodeValue}`);
        }
      }
      node = walker.nextNode();
    }
    return broken;
  }));
  expect(splitLines).toEqual([]);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.locator('.longimg-save').click()
  ]);
  await expect(page.locator('.save-status')).toContainText('已保存手机分页图片', { timeout: 60_000 });

  expect(download.suggestedFilename()).toMatch(/-手机分页\.zip$/);
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const zip = readFileSync(path!);
  expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  expect(zip.toString('utf8')).toMatch(/-01\.png/);
  expect(zip.toString('utf8')).toMatch(/-02\.png/);
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

  // 生成完成后弹窗自动收起
  await expect(page.locator('.longimg-overlay')).toBeHidden();
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
