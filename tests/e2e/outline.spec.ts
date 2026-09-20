import { test, expect, openEditor, setSource } from './fixtures';

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('段落导航位于预览右侧中间，默认轻量且不挤压正文', async ({ page }) => {
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

  const rail = page.getByRole('navigation', { name: '文章大纲' });
  const pane = page.locator('.preview-pane');
  const preview = page.locator('.md-preview');
  await expect(rail).toBeVisible();
  await expect(rail.locator('.outline-marker')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '查看文章大纲' })).toHaveCount(0);

  const [railBox, paneBox, before] = await Promise.all([
    rail.boundingBox(),
    pane.boundingBox(),
    preview.boundingBox()
  ]);
  expect(railBox!.x).toBeGreaterThan(paneBox!.x + paneBox!.width / 2);
  expect(Math.abs((railBox!.y + railBox!.height / 2) - (paneBox!.y + paneBox!.height / 2)))
    .toBeLessThan(30);

  const markerMetrics = await rail.locator('.outline-marker').evaluateAll((items) => items.map((item) => {
    const line = getComputedStyle(item, '::before');
    return {
      hitHeight: item.getBoundingClientRect().height,
      lineWidth: parseFloat(line.width),
      lineHeight: parseFloat(line.height)
    };
  }));
  expect(markerMetrics.every(({ lineWidth }) => lineWidth <= 10)).toBe(true);
  expect(markerMetrics.every(({ lineHeight }) => lineHeight <= 2.5)).toBe(true);
  expect(markerMetrics.every(({ hitHeight }) => hitHeight >= 8)).toBe(true);
  expect(new Set(markerMetrics.map(({ lineWidth }) => Math.round(lineWidth))).size).toBe(1);

  await rail.locator('.outline-marker[data-outline-title="用户反馈"]').hover();
  await expect(page.locator('.outline-popover')).toBeVisible();
  expect(await preview.boundingBox()).toEqual(before);
});

test('悬停刻度形成由近到远的长度梯度，并与摘要卡片保持间距', async ({ page }) => {
  await setSource(page, [
    '# 第一段', '', '一。',
    '## 第二段', '', '二。',
    '## 第三段', '', '三。',
    '## 用户反馈', '', '反馈内容与改进建议。',
    '## 第五段', '', '五。',
    '## 第六段', '', '六。',
    '## 第七段', '', '七。'
  ].join('\n'));

  const rail = page.getByRole('navigation', { name: '文章大纲' });
  const target = rail.locator('.outline-marker[data-outline-title="用户反馈"]');
  const idleWidth = await target.evaluate((element) => parseFloat(getComputedStyle(element, '::before').width));
  await target.hover();

  const popover = page.locator('.outline-popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('.outline-preview-title')).toHaveText('用户反馈');
  await expect(popover.locator('.outline-preview-summary')).toContainText('反馈内容与改进建议');
  await expect(popover).not.toContainText('下一步计划');
  await expect.poll(() => target.evaluate((element) => parseFloat(getComputedStyle(element, '::before').width)))
    .toBeGreaterThan(idleWidth + 18);
  const widths = await rail.locator('.outline-marker').evaluateAll((items) => items.map((item) =>
    parseFloat(getComputedStyle(item, '::before').width)));
  expect(widths[3]).toBeGreaterThan(widths[2]);
  expect(widths[2]).toBeGreaterThan(widths[1]);
  expect(widths[1]).toBeGreaterThan(widths[0]);
  expect(widths[3]).toBeGreaterThan(widths[4]);
  expect(widths[4]).toBeGreaterThan(widths[5]);
  expect(widths[5]).toBeGreaterThan(widths[6]);

  const gap = await target.evaluate((element) => {
    const marker = element.getBoundingClientRect();
    const lineWidth = parseFloat(getComputedStyle(element, '::before').width);
    const card = document.querySelector('.outline-popover')!.getBoundingClientRect();
    return marker.right - lineWidth - card.right;
  });
  expect(gap).toBeGreaterThanOrEqual(8);
});

test('每条刻度使用连续的整行命中区域，在线条之间移动时摘要不闪断', async ({ page }) => {
  await setSource(page, '# 第一段\n\n一。\n\n## 第二段\n\n二。\n\n## 第三段\n\n三。');
  const markers = page.locator('.outline-marker');
  const boxes = await markers.evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  }));

  expect(boxes[1].top - boxes[0].bottom).toBeLessThanOrEqual(0.5);
  expect(boxes[2].top - boxes[1].bottom).toBeLessThanOrEqual(0.5);
  await page.mouse.move((boxes[0].left + boxes[0].right) / 2, boxes[0].bottom);
  await expect(page.locator('.outline-popover')).toBeVisible();
  await page.mouse.move((boxes[1].left + boxes[1].right) / 2, (boxes[1].top + boxes[1].bottom) / 2);
  await expect(page.locator('.outline-popover')).toBeVisible();
  await expect(page.locator('.outline-preview-title')).toHaveText('第二段');
});

test('点击刻度跳转，并将当前段落及前后各一格显示为较深灰色', async ({ page }) => {
  const longText = Array.from({ length: 18 }, (_, index) => `第 ${index + 1} 段正文，用来撑开阅读距离。`).join('\n\n');
  await setSource(page, `# 开始\n\n${longText}\n\n## 中段\n\n${longText}\n\n## 结尾\n\n${longText}`);

  const rail = page.getByRole('navigation', { name: '文章大纲' });
  await rail.locator('.outline-marker[data-outline-title="中段"]').click();

  await expect(page.locator('.outline-marker[data-outline-title="中段"]')).toHaveClass(/is-active/);
  await expect(rail.locator('.outline-marker.is-nearby')).toHaveCount(3);
  await expect.poll(() => page.locator('.md-preview').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test('没有标题时不显示大纲刻度', async ({ page }) => {
  await setSource(page, '这里只有正文，没有 Markdown 标题。');

  await expect(page.getByRole('navigation', { name: '文章大纲' })).toBeHidden();
});
