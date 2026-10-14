import { test, expect, openEditor, setSource } from './fixtures';

function matrixMarkdown() {
  return Array.from({ length: 24 }, (_, index) => {
    const level = (index % 4) + 1;
    const title = index % 2 === 0
      ? '第 ' + (index + 1) + ' 节 窄侧栏长中文标题验证内容不重叠'
      : 'Level ' + (index + 1) + ' long English outline title keeps its readable layout';
    return '#'.repeat(level) + ' ' + title;
  }).join('\n\n');
}

async function openOutline(page) {
  await page.getByRole('button', { name: '大纲', exact: true }).first().click();
  const panel = page.locator('.outline-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test('desktop outline resize keeps the full outside and inside hit area', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page);
  await setSource(page, matrixMarkdown());
  await page.locator('[data-mode="split"]').click();

  const panel = await openOutline(page);
  const items = panel.locator('.outline-tree-item');
  await expect(items).toHaveCount(24);

  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.outline-panel')!;
    const handle = document.querySelector('.outline-resize-handle')!;
    const panelRect = panel.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    const y = panelRect.top + Math.min(300, panelRect.height / 2);
    const xs = [];
    for (let x = Math.ceil(handleRect.left + 0.5); x <= Math.floor(handleRect.right - 0.5); x++) {
      const target = document.elementFromPoint(x, y);
      xs.push({ x, target: target?.className || '' });
    }
    return {
      panelLeft: panelRect.left,
      handleLeft: handleRect.left,
      handleRight: handleRect.right,
      y,
      xs,
      panelWidth: panelRect.width,
    };
  });

  expect(layout.handleLeft).toBeLessThan(layout.panelLeft);
  expect(layout.xs.filter(({ target }) => target.includes('outline-resize-handle')).map(({ x }) => x))
    .toEqual(layout.xs.map(({ x }) => x));
  expect(layout.xs.some(({ x, target }) => x < layout.panelLeft && target.includes('outline-resize-handle'))).toBe(true);
  expect(layout.xs.some(({ x, target }) => x >= layout.panelLeft && target.includes('outline-resize-handle'))).toBe(true);

  const titleBoxes = await items.locator('.outline-tree-item-label').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, text: node.textContent };
    })
  );
  expect(titleBoxes).toHaveLength(24);
  for (let index = 1; index < titleBoxes.length; index++) {
    expect(titleBoxes[index].top).toBeGreaterThanOrEqual(titleBoxes[index - 1].bottom - 0.5);
  }

  const dragX = layout.xs.find(({ x, target }) => x < layout.panelLeft && target.includes('outline-resize-handle'))!.x;
  const before = await panel.evaluate((element) => element.getBoundingClientRect().width);
  await page.mouse.move(dragX, layout.y);
  await page.mouse.down();
  await page.mouse.move(dragX - 30, layout.y);
  await page.mouse.up();
  const expanded = await panel.evaluate((element) => element.getBoundingClientRect().width);
  expect(expanded).toBeGreaterThan(before);

  const current = await panel.evaluate((element) => element.getBoundingClientRect().width);
  const panelBox = await panel.boundingBox();
  const innerDragX = Math.ceil(panelBox!.x + 2);
  const innerTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className || '', {
    x: innerDragX,
    y: layout.y,
  });
  expect(innerTarget).toContain('outline-resize-handle');
  await page.mouse.move(innerDragX, layout.y);
  await page.mouse.down();
  await page.mouse.move(1280 - 260, layout.y);
  await page.mouse.up();
  await expect.poll(() => panel.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(260);
  expect(current).toBeGreaterThan(260);
  await expect(panel.locator('.panel-close')).toBeVisible();
  await expect(page.locator('.editor-main')).not.toHaveClass(/editor-mode-active/);
  await expect(page.locator('.editor-main')).not.toHaveClass(/preview-mode-active/);
});

test('mobile outline hides the desktop resize handle while keeping long titles readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await setSource(page, matrixMarkdown());
  await page.locator('[data-mobile-edit-done]').click();
  await page.locator('.app-header .mobile-menu-toggle').click();
  await page.locator('[data-mobile-action="focus"]').click();
  await page.locator('.mobile-focus-menu').click();
  await page.locator('[data-mobile-action="outline"]').click();
  const panel = page.locator('.outline-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('.outline-resize-handle')).toBeHidden();
  await expect(panel.locator('.outline-tree-item-label').first()).toHaveCSS('white-space', 'normal');
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
});
