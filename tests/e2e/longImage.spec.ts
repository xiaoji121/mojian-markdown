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

  expect(colors.preview).toBe('rgb(192, 237, 198)');
  expect(colors.poster).toBe(colors.preview);
  expect(colors.snapshot).toBe('#c0edc6');
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
  await expect(poster.locator('.longimg-title')).toHaveText('未命名 - 摘录');
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

test('静态长图里的 Mermaid 多行连线文案保持完整可见', async ({ page }) => {
  await setSource(page, `\`\`\`mermaid
flowchart LR
  A[用例] -->|派生任务与<br/>断言能力| B[执行器]
\`\`\``);
  await expect(page.locator('.md-preview g.edgeLabel foreignObject').filter({ hasText: '派生任务与' })).toBeVisible();
  await page.locator('.longimg-entry').click();

  const label = page.locator('.longimg-poster g.edgeLabel foreignObject').filter({ hasText: '派生任务与' });
  await expect(label).toBeVisible();
  await expect(label).toContainText('断言能力');
  await expect(label).toHaveCSS('overflow', 'visible');
});

test('长图字号在弹窗内独立调节，手机档默认 48px 且不改变编辑器字号', async ({ page }) => {
  await page.locator('.longimg-entry').click();
  const poster = page.locator('.longimg-poster');
  await expect(poster).toHaveCSS('width', '900px');
  await expect(poster).toHaveCSS('font-size', '22px');
  await expect(page.locator('.longimg-crop-toggle')).toBeHidden();
  const marks = page.locator('.longimg-modal-head .longimg-mark-toggle');
  await expect(marks).toBeVisible();
  await expect(marks).toHaveAttribute('role', 'switch');
  await expect(marks).toHaveAttribute('aria-checked', 'true');

  await page.locator('[data-longimg-width="phone"]').click();

  await expect(page.locator('.longimg-poster')).toHaveCSS('width', '1080px');
  await expect(page.locator('.longimg-poster')).toHaveCSS('font-size', '48px');
  await expect(page.locator('.longimg-font-value')).toHaveText('48px');
  await expect(page.locator('.font-size-value')).toHaveText('16px');
  await page.getByRole('button', { name: '增大图片字号' }).click();
  await expect(page.locator('.longimg-poster')).toHaveCSS('font-size', '50px');
  await expect(page.locator('.longimg-font-value')).toHaveText('50px');
  await expect(page.locator('.font-size-value')).toHaveText('16px');
  await expect(page.locator('[data-longimg-width="phone"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.longimg-crop-toggle')).toBeVisible();
});

test('手机长图使用更舒展的左右页边距，标准档保持原版心', async ({ page }) => {
  await page.locator('.longimg-entry').click();
  await expect(page.locator('.longimg-poster')).toHaveCSS('padding-left', '48px');
  await expect(page.locator('.longimg-poster')).toHaveCSS('padding-right', '48px');

  await page.locator('[data-longimg-width="phone"]').click();
  await expect(page.locator('.longimg-poster')).toHaveCSS('padding-left', '120px');
  await expect(page.locator('.longimg-poster')).toHaveCSS('padding-right', '120px');
});

test('手机长图在 48px 字号下每行最多容纳 17 个汉字或标点', async ({ page }) => {
  const text = '天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。寒来暑往，秋收冬藏。';
  await setSource(page, '# 字符行宽测试\n\n' + text);
  await page.locator('.longimg-entry').click();
  await page.locator('[data-longimg-width="phone"]').click();

  const lineLengths = await page.locator('.longimg-prose p').evaluate((paragraph) => {
    const node = paragraph.firstChild!;
    const lines = new Map<number, number>();
    for (let index = 0; index < (node.textContent || '').length; index += 1) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const top = Math.round(range.getBoundingClientRect().top);
      lines.set(top, (lines.get(top) || 0) + 1);
    }
    return [...lines.values()];
  });

  expect(Math.max(...lineLengths)).toBeLessThanOrEqual(17);
  expect(lineLengths[0]).toBeGreaterThanOrEqual(16);
});

test('手机长图页脚只保留简短品牌，品牌与文件名都保持单行', async ({ page }) => {
  await page.locator('.longimg-entry').click();
  await page.locator('[data-longimg-width="phone"]').click();

  const footer = page.locator('.longimg-foot');
  await expect(footer.locator('span').first()).toHaveText('墨笺 Markdown');
  const lines = await footer.locator('span').evaluateAll((spans) => spans.map((span) => {
    const style = getComputedStyle(span);
    return span.getBoundingClientRect().height / parseFloat(style.lineHeight);
  }));
  expect(lines.every((count) => count <= 1.1)).toBe(true);
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
  const pageTopInsets = await previews.locator('.longimg-page-viewport').evaluateAll((viewports) =>
    viewports.slice(0, 2).map((viewport) => parseFloat((viewport as HTMLElement).style.top))
  );
  expect(pageTopInsets).toEqual([40, 88]);
  const firstPageNumber = previews.first().locator('.longimg-page-number');
  await expect(firstPageNumber).toContainText('1 /');
  await expect(firstPageNumber).toHaveCSS('font-size', '24px');
  const pageNumberGap = await previews.first().evaluate((preview) => {
    const viewport = preview.querySelector('.longimg-page-viewport')!.getBoundingClientRect();
    const pageNumber = preview.querySelector('.longimg-page-number')!.getBoundingClientRect();
    const scale = preview.getBoundingClientRect().width / (preview as HTMLElement).offsetWidth;
    return (pageNumber.top - viewport.bottom) / scale;
  });
  expect(pageNumberGap).toBeGreaterThanOrEqual(20);
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

test('下载的手机分页图片包含右下角页码', async ({ page }) => {
  const sections = Array.from({ length: 12 }, (_, index) =>
    `## 第 ${index + 1} 节\n\n这是用于验证导出页码的一段正文。`
  ).join('\n\n');
  await setSource(page, '# 导出页码测试\n\n' + sections);
  await page.locator('.longimg-entry').click();
  await page.locator('[data-longimg-width="phone"]').click();
  await page.locator('.longimg-crop-toggle').click();
  await page.evaluate(() => {
    const calls: string[] = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      calls.push(String(text));
      return original.call(this, text, ...args);
    };
    (window as typeof window & { __longImagePageNumbers?: string[] }).__longImagePageNumbers = calls;
  });

  const pageCount = await page.locator('.longimg-page-preview').count();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.locator('.longimg-save').click()
  ]);
  await download.path();

  const drawn = await page.evaluate(() =>
    (window as typeof window & { __longImagePageNumbers?: string[] }).__longImagePageNumbers || []
  );
  expect(drawn).toEqual(Array.from({ length: pageCount }, (_, index) => `${index + 1} / ${pageCount}`));
});

test('大字号下长段落不会被整体推到下一页，第一页保持充分利用', async ({ page }) => {
  const longParagraph = Array.from({ length: 60 }, () => '这是一段需要在行间智能分页的正文内容。').join('');
  await setSource(page, '# 分页利用率\n\n## 长段落标题\n\n' + longParagraph + '\n\n## 下一节\n\n结尾。');
  await page.locator('.longimg-entry').click();
  await page.locator('[data-longimg-width="phone"]').click();
  await page.locator('.longimg-crop-toggle').click();

  const firstViewportHeight = await page.locator('.longimg-page-viewport').first()
    .evaluate((viewport) => parseFloat((viewport as HTMLElement).style.height));
  expect(firstViewportHeight).toBeGreaterThan(1200);
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
