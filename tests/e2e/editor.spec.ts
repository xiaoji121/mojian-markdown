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

test('LaTeX 行内公式与块级公式正常排版', async ({ page }) => {
  await setSource(page, '速度 $7\\text{ km/h}$，跑了 $3.5\\text{ 公里}$。\n\n$$\\frac{3.5}{7} = 0.5$$');

  const preview = page.locator('.md-preview');
  await expect(preview.locator('.katex').first()).toBeVisible();
  await expect(preview.locator('.katex-display')).toBeVisible();
  await expect(preview.locator('annotation').first()).toHaveText('7\\text{ km/h}');
  await expect(preview).not.toContainText('$7\\text{ km/h}$');
});

test('顶栏使用产品图标并支持双击重命名文档', async ({ page }) => {
  const productIcon = page.locator('.brand-mark');
  const fileName = page.locator('.file-name');

  await expect(page.locator('.brand-dot')).toHaveCount(0);
  await expect(productIcon).toBeVisible();
  await expect(productIcon.locator('img')).toHaveAttribute('src', '/favicon.svg');
  await expect(fileName).toHaveAttribute('title', /双击重命名/);

  await fileName.dblclick();
  await expect(fileName).toHaveAttribute('contenteditable', 'true');
  await expect(fileName).toBeFocused();
  await fileName.fill('重命名后的笔记');
  await fileName.press('Enter');

  await expect(fileName).toHaveText('重命名后的笔记.md');
  await expect(fileName).not.toHaveAttribute('contenteditable', 'true');

  await page.reload();
  await expect(page.locator('.file-name')).toHaveText('重命名后的笔记.md');
});

test('首次使用时 AI 渠道默认选择 Codex', async ({ page }) => {
  await expect(page.locator('.ai-engine-chip')).toHaveText('Codex');
});

test('Mermaid 长节点换行后仍完整展示内容', async ({ page }) => {
  const label = '关于定投如果未来失业没有固定收入时应该如何调整投入节奏';
  await setSource(page, '```mermaid\nflowchart TD\n  q0(["关于定投如果未来失业没有固定收入<br/>时应该如何调整投入节奏 · 摘录"])\n```');

  const node = page.locator('.mermaid-rendered .node').first();
  await expect(node).toBeVisible();
  await expect(node).toContainText(label + ' · 摘录');
  await expect(node).not.toContainText('…');
});

test('Mermaid 连线上的长文案不会被 SVG 标签边界裁切', async ({ page }) => {
  const firstLine = '应锁定二进制 SHA /';
  const secondLine = '版本控制信息完整展示';
  await setSource(page, `\`\`\`mermaid
flowchart LR
  A[用例] -->|${firstLine}<br/>${secondLine}| B[执行器]
\`\`\``);

  const edgeLabel = page.locator('.mermaid-rendered g.edgeLabel foreignObject').filter({ hasText: firstLine });
  await expect(edgeLabel).toBeVisible();
  const overflow = await edgeLabel.evaluate((element) => {
    const container = element;
    const text = element.querySelector('p, span') || element;
    const outer = container.getBoundingClientRect();
    const inner = text.getBoundingClientRect();
    const clipped = getComputedStyle(container).overflow !== 'visible';
    return clipped ? Math.max(inner.right - outer.right, inner.bottom - outer.bottom) : 0;
  });
  expect(overflow).toBeLessThanOrEqual(0.5);
  await expect(edgeLabel).toContainText(secondLine);
});

test('Mermaid 多行分组标题不会被组内首个节点遮挡', async ({ page }) => {
  await setSource(page, `\`\`\`mermaid
flowchart TD
  subgraph PROJECT["本工程：dws-larkcli-eval（评测编排与竞对<br/>职责）"]
    CASES["cases/*.yaml<br/>用例、断言、能力覆盖"]
  end
\`\`\``);

  const diagram = page.locator('.mermaid-rendered');
  await expect(diagram.locator('.node')).toBeVisible();
  await expect(diagram.locator('.cluster-label')).toContainText('本工程：dws-larkcli-eval（评测编排与竞对 · 职责）');
  const overlap = await diagram.evaluate((root) => {
    const title = root.querySelector('.cluster-label foreignObject, .cluster-label text')!;
    const node = root.querySelector('.node')!;
    const titleRect = title.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    return titleRect.bottom - nodeRect.top;
  });
  expect(overlap).toBeLessThanOrEqual(0);
});

test('Mermaid 流程图可以独立全屏查看并按 Escape 退出', async ({ page }) => {
  await setSource(page, '```mermaid\nflowchart LR\n  A[开始] --> B[查看细节]\n```');

  const diagram = page.locator('.mermaid-rendered');
  await expect(diagram.getByRole('button', { name: '全屏查看流程图' })).toBeVisible();
  await diagram.getByRole('button', { name: '全屏查看流程图' }).click();
  await expect(diagram).toHaveClass(/is-fullscreen/);
  await expect(diagram.getByRole('button', { name: '退出流程图全屏' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(diagram).not.toHaveClass(/is-fullscreen/);
});

test('字数统计跟随内容更新', async ({ page }) => {
  await setSource(page, '一二三\n四五');

  await expect(page.locator('.word-count')).toHaveText('5 字 · 2 行');
});

test('主题移入排版后仍有清晰图标与足够的点击区域', async ({ page }) => {
  await page.getByRole('button', { name: '阅读排版', exact: true }).click();
  const theme = page.getByRole('button', { name: '切换亮色或暗黑主题' });
  const bounds = await theme.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(32);
  await expect(theme.locator('svg')).toHaveCSS('width', '16px');
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

test('分屏分隔条拖拽顺畅且热区不遮挡相邻滚动条', async ({ page }) => {
  const divider = page.locator('.editor-divider');
  const hitArea = page.locator('.editor-divider-hit');
  const sourcePane = page.locator('.source-pane');
  const dividerBox = await divider.boundingBox();
  const hitBox = await hitArea.boundingBox();
  const before = await sourcePane.boundingBox();

  expect(dividerBox).not.toBeNull();
  expect(hitBox).not.toBeNull();
  expect(before).not.toBeNull();
  // 热区只略宽于视觉线，不能再覆盖两侧滚动条。
  expect(hitBox!.width).toBeLessThanOrEqual(9);

  // 从视觉细线右侧 3px 处开始仍可轻松拖动。
  const startX = dividerBox!.x + dividerBox!.width / 2 + 3;
  const startY = dividerBox!.y + dividerBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY);
  await page.mouse.up();

  const after = await sourcePane.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width + 50);

  // 拖动留下的分屏比例不能限制单栏模式；切到预览后应重新占满主体。
  await page.locator('.view-mode-option[data-mode="preview"]').click();
  const [mainBox, previewBox] = await Promise.all([
    page.locator('.editor-main').boundingBox(),
    page.locator('.preview-pane').boundingBox()
  ]);
  expect(mainBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.width).toBeGreaterThanOrEqual(mainBox!.width - 1);
});

test('分屏线采用整高反馈且滚动条滑块适度加粗', async ({ page }) => {
  const styles = await page.evaluate(() => {
    const divider = document.querySelector('.editor-divider')!;
    const hit = document.querySelector('.editor-divider-hit')!;
    const thumb = getComputedStyle(document.documentElement, '::-webkit-scrollbar-thumb');
    return {
      dividerTransition: getComputedStyle(divider).transitionProperty,
      shortIndicator: getComputedStyle(hit, '::after').content,
      thumbBorder: thumb.borderTopWidth
    };
  });

  expect(styles.dividerTransition).toContain('background');
  expect(styles.shortIndicator).toBe('none');
  expect(styles.thumbBorder).toBe('3px');
  await expect(page.locator('html')).toHaveCSS('--scrollbar-size', '12px');
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

  await page.getByRole('button', { name: '阅读排版', exact: true }).click();
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
