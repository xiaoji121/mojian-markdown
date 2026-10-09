import { test, expect, openEditor, setSource } from './fixtures';

async function bridgeWorkspace(page) {
  await page.route('**/src/editor/featureFlags.ts', route => route.fulfill({
    contentType: 'application/javascript', body: 'export const ENABLE_AGENT_BRIDGE = true;'
  }));
  await page.route('http://127.0.0.1:4317/**', route => route.fulfill({ json: {
    documents: [
      { documentId: 'risk', fileName: '非对称风险.md', updatedAt: '2026-10-09', annotations: [], messages: [] },
      { documentId: 'walk', fileName: '随机漫步.md', updatedAt: '2026-10-08', annotations: [], messages: [] }
    ], conversations: [], messages: []
  } }));
}

test('文档侧栏常驻，新建打开与设置有明确归属，导出独立', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const sidebar = page.getByRole('complementary', { name: '最近阅读文档' });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator('img.workspace-brand-icon')).toBeVisible();
  await expect(sidebar.locator('img.workspace-brand-icon')).toHaveAttribute('src', '/favicon.svg');
  await expect(sidebar.locator('img.workspace-brand-icon')).toHaveAttribute('alt', '');
  await expect(sidebar.getByRole('button', { name: '新建文档', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '打开文件', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  expect((await sidebar.boundingBox())!.y).toBe(0);
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const menu = page.getByRole('menu', { name: '导出' });
  await expect(menu.getByRole('menuitem', { name: '导出长图', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /设置|新建|界面语言/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '导出', exact: true })).toBeFocused();
});

test('网页版常规设置不显示桌面绝对路径入口', async ({ page }) => {
  await openEditor(page);
  await page.locator('.workspace-settings-button').click();
  await page.locator('[data-settings-tab="general"]').click();
  await expect(page.getByRole('button', { name: '输入绝对路径打开…', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: '返回首页', exact: true })).toBeVisible();
});

test('桌面侧栏打开时只显示一个收起入口，顶栏保持紧凑', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bridgeWorkspace(page);
  await openEditor(page);

  const sidebar = page.locator('.document-sidebar');
  const closeSidebar = page.getByRole('button', { name: '关闭最近阅读', exact: true });
  const openSidebar = page.getByRole('button', { name: '最近阅读', exact: true });
  await expect(sidebar).toBeVisible();
  await expect(closeSidebar).toBeVisible();
  await expect(openSidebar).toBeHidden();
  const headerHeight = (await page.locator('.app-header').boundingBox())!.height;
  expect(headerHeight).toBeLessThanOrEqual(56);
  expect((await page.locator('.workspace-brand').boundingBox())!.height).toBe(headerHeight);

  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  expect((await page.locator('.ai-panel .panel-header').boundingBox())!.height).toBe(headerHeight);

  await closeSidebar.click();
  await expect(sidebar).toBeHidden();
  await expect(openSidebar).toBeVisible();
});

test('筛选最近文档不改变当前内容，清空恢复列表', async ({ page }) => {
  await bridgeWorkspace(page);
  await openEditor(page);
  const source = await page.locator('.md-source').inputValue();
  const search = page.getByRole('searchbox', { name: '搜索文档', exact: true });
  await search.fill('风险');
  await expect(page.locator('.recent-document-item')).toHaveCount(1);
  await expect(page.locator('.recent-document-item')).toContainText('非对称风险');
  await search.fill('不存在');
  await expect(page.locator('.recent-document-list')).toContainText('没有匹配的文档');
  await search.fill('');
  await expect(page.locator('.recent-document-item')).toHaveCount(2);
  await expect(page.locator('.md-source')).toHaveValue(source);
});

test('批注与 AI 标签互换，保留未发送内容，顶栏不被面板遮挡', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bridgeWorkspace(page);
  await openEditor(page);
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.locator('.ai-input').fill('保留这段未发送的问题');
  await page.getByRole('tab', { name: '批注', exact: true }).click();
  await expect(page.locator('.comments-panel')).toBeVisible();
  await expect(page.locator('.ai-panel')).toBeHidden();
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect(page.locator('.ai-input')).toHaveValue('保留这段未发送的问题');
  const panel = await page.locator('.ai-panel').boundingBox();
  const header = await page.locator('.header-actions').boundingBox();
  expect(panel!.y).toBe(0);
  expect(header!.x + header!.width).toBeLessThanOrEqual(panel!.x);
  await expect(page.locator('.md-preview')).toBeVisible();
});

test('批注与 AI 侧边栏使用相同宽度，切换时编辑区不抖动', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bridgeWorkspace(page);
  await openEditor(page);
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();

  const aiPanelWidth = Math.round((await page.locator('.ai-panel').boundingBox())!.width);
  const editorWidthBefore = Math.round((await page.locator('.editor-main').boundingBox())!.width);
  await page.locator('.ai-panel .assistance-tabs [role="tab"]').filter({ hasText: '批注' }).click();
  const commentsPanelWidth = Math.round((await page.locator('.comments-panel').boundingBox())!.width);
  const editorWidthAfter = Math.round((await page.locator('.editor-main').boundingBox())!.width);
  expect(commentsPanelWidth).toBe(aiPanelWidth);
  expect(editorWidthAfter).toBe(editorWidthBefore);

  await page.locator('.comments-panel .assistance-tabs [role="tab"]').filter({ hasText: 'AI' }).click();
  const aiPanelWidthAgain = Math.round((await page.locator('.ai-panel').boundingBox())!.width);
  const editorWidthAfterReverse = Math.round((await page.locator('.editor-main').boundingBox())!.width);
  expect(aiPanelWidthAgain).toBe(commentsPanelWidth);
  expect(editorWidthAfterReverse).toBe(editorWidthBefore);
});

test('快捷排版与完整设置共享偏好，关闭设置恢复焦点与阅读位置', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# 阅读\n\n' + '内容段落。\n\n'.repeat(80));
  await page.locator('[data-mode="preview"]').click();
  await page.getByRole('button', { name: '排版', exact: true }).click();
  const quick = page.getByRole('dialog', { name: '快捷排版' });
  await quick.getByRole('button', { name: '放大字号', exact: true }).click();
  await expect(page.locator('.md-preview')).toHaveCSS('font-size', '17px');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '排版', exact: true })).toBeFocused();
  await page.locator('.md-preview').evaluate(el => { el.scrollTop = 400; });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole('tab', { name: '外观与阅读', exact: true }).click();
  await expect(settings.locator('.font-size-value')).toHaveText('17px');
  await settings.getByRole('tab', { name: '常规', exact: true }).click();
  await expect(settings.getByRole('radio', { name: '简体中文', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused();
  await expect.poll(() => page.locator('.md-preview').evaluate(el => el.scrollTop)).toBe(400);
});

test('专注临时收起辅助区，退出后恢复所选标签与问题', async ({ page }) => {
  await bridgeWorkspace(page);
  await openEditor(page);
  await page.locator('[data-mode="preview"]').click();
  await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.locator('.ai-input').fill('专注后继续');
  await page.getByRole('button', { name: '沉浸式阅读', exact: true }).click();
  await expect(page.locator('.ai-panel')).toBeHidden();
  await expect(page.locator('.document-sidebar')).toBeHidden();
  expect(await page.locator('.app-header').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.locator('.app-header').evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await expect(page.locator('.ai-panel')).toBeVisible();
  await expect(page.locator('.ai-input')).toHaveValue('专注后继续');
  await expect(page.locator('.document-sidebar')).toBeVisible();
});

test('窄屏侧栏可打开和关闭，设置和正文不产生横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await expect(page.getByRole('button', { name: '最近阅读', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '最近阅读', exact: true }).click();
  await expect(page.getByRole('button', { name: '最近阅读', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings).toBeVisible();
  const bounds = await settings.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '关闭最近阅读', exact: true }).click();
  await expect(page.locator('.document-sidebar')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});


test('专注中调整辅助面板宽度，正文与侧栏保持相邻且设置不遮挡关闭按钮', async ({ page }) => {
  await bridgeWorkspace(page);
  await openEditor(page);
  await page.getByRole('button', { name: '沉浸式阅读', exact: true }).click();
  await page.getByRole('button', { name: '显示批注', exact: true }).click();
  for (const kind of ['comments', 'ai']) {
    if (kind === 'ai') await page.getByRole('tab', { name: 'AI', exact: true }).click();
    const handle = (await page.locator(`.${kind}-resize-handle`).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 180);
    await page.mouse.down();
    await page.mouse.move(560, handle.y + 180, { steps: 6 });
    await page.mouse.up();
    const panel = (await page.locator(`.${kind}-panel`).boundingBox())!;
    const preview = (await page.locator('.preview-pane').boundingBox())!;
    expect(Math.abs(preview.x + preview.width - panel.x)).toBeLessThanOrEqual(2);
    const settings = (await page.locator('.focus-settings-button').boundingBox())!;
    expect(settings.x + settings.width).toBeLessThanOrEqual(panel.x);
  }
});
