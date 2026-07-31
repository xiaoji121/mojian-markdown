import { test, expect, openEditor, setSource } from './fixtures';

test('editor uses the complete local Canger reading font without remote fonts', async ({ page }) => {
  const remoteFontRequests: string[] = [];
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (request.resourceType() === 'font' || /cejk-subset\.woff2/.test(url)) fontRequests.push(url);
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) {
      remoteFontRequests.push(url);
    }
  });

  // beforeEach opened the editor before the request listener existed; reload so
  // this test observes the complete first-paint resource sequence.
  await page.reload();
  await expect(page.locator('.md-source')).toBeVisible();
  await expect(page.locator('.md-preview h1').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page.locator('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]')).toHaveCount(0);
  expect(remoteFontRequests).toEqual([]);
  expect(fontRequests).toHaveLength(1);
  expect(fontRequests[0]).toContain('/cejk-subset.woff2');
  expect(await page.locator('.md-preview').evaluate((element) => getComputedStyle(element).fontFamily))
    .toContain('Canger JinKai 04');
});

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test('输入 Markdown 后预览实时渲染', async ({ page }) => {
  await setSource(page, '# 端到端标题\n\n正文**加粗**内容。\n\n- 第一项\n- 第二项');

  const preview = page.locator('.md-preview');
  await expect(preview.locator('h1')).toHaveText('端到端标题');
  await expect(preview.locator('strong')).toHaveText('加粗');
  await expect(preview.locator('li')).toHaveCount(2);
});

test('字数统计跟随内容更新', async ({ page }) => {
  await setSource(page, '一二三\n四五');

  await expect(page.locator('.word-count')).toHaveText('5 字 · 2 行');
});

test('视图切换在编辑、分屏、预览三种布局间生效', async ({ page }) => {
  const main = page.locator('.editor-main');
  const source = page.locator('.md-source');
  const preview = page.locator('.md-preview');

  await page.locator('.view-mode-option[data-mode="editor"]').click();
  await expect(main).toHaveClass(/editor-mode-active/);
  await expect(source).toBeVisible();
  await expect(preview).toBeHidden();

  await page.locator('.view-mode-option[data-mode="preview"]').click();
  await expect(main).toHaveClass(/preview-mode-active/);
  await expect(preview).toBeVisible();
  await expect(source).toBeHidden();

  await page.locator('.view-mode-option[data-mode="split"]').click();
  await expect(main).not.toHaveClass(/editor-mode-active|preview-mode-active/);
  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();
});

test('窄屏分屏模式下预览工具栏按钮不挤压换行', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });

  const previewPane = page.locator('.preview-pane');
  const toolbar = previewPane.locator('.pane-toolbar');
  const outlineButton = page.getByRole('button', { name: '查看文章大纲' });
  const immersiveButton = page.getByRole('button', { name: '沉浸式阅读' });

  await expect(previewPane.locator('.preview-toolbar-hint')).toBeHidden();
  await expect(outlineButton.locator('.action-label')).toBeHidden();
  await expect(immersiveButton.locator('.fullscreen-button-label')).toBeHidden();

  const [toolbarBox, outlineBox, immersiveBox] = await Promise.all([
    toolbar.boundingBox(),
    outlineButton.boundingBox(),
    immersiveButton.boundingBox()
  ]);
  expect(toolbarBox).not.toBeNull();
  expect(outlineBox).not.toBeNull();
  expect(immersiveBox).not.toBeNull();
  expect(outlineBox!.height).toBeLessThanOrEqual(30);
  expect(immersiveBox!.height).toBeLessThanOrEqual(30);
  expect(outlineBox!.x + outlineBox!.width).toBeLessThanOrEqual(toolbarBox!.x + toolbarBox!.width);
  expect(immersiveBox!.x + immersiveBox!.width).toBeLessThanOrEqual(toolbarBox!.x + toolbarBox!.width);
});

test('打开批注面板后预览工具栏收纳，不与面板重叠', async ({ page }) => {
  await page.getByRole('button', { name: /^批注/ }).click();
  const panel = page.locator('.comments-panel');
  await expect(panel).toBeVisible();

  const immersiveButton = page.getByRole('button', { name: '沉浸式阅读' });
  await expect(immersiveButton).toBeVisible();

  const [panelBox, immersiveBox] = await Promise.all([
    panel.boundingBox(),
    immersiveButton.boundingBox()
  ]);
  expect(panelBox).not.toBeNull();
  expect(immersiveBox).not.toBeNull();
  // 工具栏内容完整留在预览栏内，不越过批注面板左缘
  expect(immersiveBox!.x + immersiveBox!.width).toBeLessThanOrEqual(panelBox!.x + 1);
});

test('主题切换写入 data-theme 并可来回切换', async ({ page }) => {
  const body = page.locator('body');
  const initial = await body.getAttribute('data-theme');
  const other = initial === 'dark' ? 'light' : 'dark';

  await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
  await expect(body).toHaveAttribute('data-theme', other);

  await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
  await expect(body).toHaveAttribute('data-theme', initial!);
});

test('界面骨架不可选中，原文与预览内容可选', async ({ page }) => {
  const styles = await page.evaluate(() => {
    const pick = (selector: string) =>
      getComputedStyle(document.querySelector(selector)!).userSelect;
    return {
      header: pick('.app-header'),
      footer: pick('.app-footer'),
      previewToolbar: pick('.preview-pane .pane-toolbar'),
      source: pick('.md-source'),
      preview: pick('.md-preview'),
      searchInput: pick('.search-input')
    };
  });

  expect(styles.header).toBe('none');
  expect(styles.footer).toBe('none');
  expect(styles.previewToolbar).toBe('none');
  expect(styles.source).toBe('text');
  expect(styles.preview).toBe('text');
  expect(styles.searchInput).toBe('text');
});

test('body 被杂散元素撑高时不出现页面级第二根滚动条', async ({ page }) => {
  // 弹层/提示类元素追加到 body 后若意外占高，页面会多出一条几乎满高的
  // 滚动条竖带（桌面端实测）；编辑器骨架自管滚动，页面级滚动必须锁死。
  await page.evaluate(() => {
    const stray = document.createElement('div');
    stray.style.height = '15px';
    document.body.appendChild(stray);
  });

  // 滚轮滚动页面本身不应生效（无头环境滚动条不占宽，只能按可滚动性断言）；
  // 落点选在顶部标题栏——内部无滚动容器，滚轮会直接作用于页面。
  await page.mouse.move(500, 20);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // 有占位滚动条的环境（桌面端）也不得让页面滚动条抢走视口宽度
  const gutter = await page.evaluate(
    () => window.innerWidth - document.documentElement.clientWidth
  );
  expect(gutter).toBe(0);
});

test('NBSP 正文与超长 token 不撑出预览区横向滚动', async ({ page }) => {
  // 钉钉文档导出的正文空格全是 U+00A0，整段成为不可断行长串；再加无断点长 token
  const nbspParagraph = ('word' + '\u00A0').repeat(120).trim();
  const longToken = 'https://example.com/' + 'x'.repeat(160);
  await page.locator('.md-source').fill('# 宽内容\n\n' + nbspParagraph + '\n\n' + longToken + '\n');

  const overflow = await page.evaluate(() => {
    const preview = document.querySelector('.md-preview')!;
    return preview.scrollWidth - preview.clientWidth;
  });

  expect(overflow).toBeLessThanOrEqual(0);
});
