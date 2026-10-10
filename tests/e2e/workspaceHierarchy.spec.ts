import { test, expect, openEditor, openAppearance, setSource } from './fixtures';

test('阅读工具属于正文，不再形成第二条通栏', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await page.locator('[data-mode="preview"]').click();
  const tools = page.locator('.preview-pane > .pane-toolbar');
  await expect(tools).toHaveCSS('position', 'absolute');
  const bounds = await tools.boundingBox();
  expect(bounds!.width).toBeLessThan(500);
  await expect(tools.locator('.pane-title')).toBeHidden();
  await expect(tools.locator('.preview-toolbar-hint')).toHaveCount(0);
  await expect(tools.getByRole('button', { name: '查找文档', exact: true })).toBeVisible();
  await expect(tools.getByRole('button', { name: '排版', exact: true })).toBeVisible();
  const title = await page.locator('.md-preview h1').boundingBox();
  expect(title!.y).toBeGreaterThan(bounds!.y + bounds!.height);
  await page.locator('[data-mode="split"]').click();
  await expect(page.getByRole('group', { name: 'Markdown 格式' })).toBeVisible();
});

test('主题从设置调整，正文查找与导出有独立入口', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('.app-header').getByRole('button', { name: '切换亮色或暗黑主题' })).toHaveCount(0);
  await expect(page.locator('.app-header').getByRole('button', { name: '打开设置' })).toHaveCount(0);
  await openAppearance(page);
  const before = await page.locator('body').getAttribute('data-theme');
  await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', before === 'dark' ? 'light' : 'dark');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '查找文档', exact: true }).click();
  await expect(page.locator('.preview-search-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page.getByRole('menuitem', { name: '导出长图', exact: true }).click();
  await expect(page.locator('.longimg-overlay')).toBeVisible();
});

test('导出菜单可用方向键和 Esc 操作，阅读模式保留快捷搜索', async ({ page }) => {
  await openEditor(page);
  const more = page.getByRole('button', { name: '导出', exact: true });
  await more.focus();
  await page.keyboard.press('ArrowDown');
  // 静态 Web 无写盘能力：「保存」隐藏，首项为备份包
  await expect(page.getByRole('menuitem', { name: '下载全文+批注备份包' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await expect(page.locator('.export-menu')).toBeHidden();
  await setSource(page, '# 搜索测试\n\n目标段落');
  await page.locator('[data-mode="preview"]').click();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.getByRole('textbox', { name: '搜索预览', exact: true })).toBeFocused();
});

for (const immersive of [false, true]) {
  test(`阅读工具随正文滚出视野，回顶后恢复（专注=${immersive}）`, async ({ page }) => {
    await openEditor(page);
    await setSource(page, '# 滚动验证\n\n' + ('正文内容。\n\n'.repeat(100)));
    await page.locator('[data-mode="preview"]').click();
    if (immersive) await page.getByRole('button', { name: '沉浸式阅读', exact: true }).click();
    const tools = page.locator('.reading-toolbar');
    const preview = page.locator('.md-preview');
    await expect(tools).toBeVisible();
    await expect(tools).not.toHaveClass(/is-scrolled-away/);
    // 产品：按下滚方向整条收起（transform），不再 1:1 跟滚位移
    await preview.evaluate((element) => { element.scrollTop = 16; });
    await expect(tools).toHaveClass(/is-scrolled-away/);
    await preview.evaluate((element) => { element.scrollTop = 400; });
    await expect(tools).toHaveClass(/is-scrolled-away/);
    await page.mouse.move(900, 5);
    await expect(tools).toHaveClass(/is-scrolled-away/);
    await preview.evaluate((element) => { element.scrollTop = 0; });
    await expect(tools).not.toHaveClass(/is-scrolled-away/);
    await expect(tools).toBeVisible();
    await openAppearance(page);
    await expect(page.locator('.reading-appearance-panel')).toBeVisible();
  });
}

test('滚动后从侧栏打开全局设置，保持文章阅读位置', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# 菜单排版\n\n' + '段落。\n\n'.repeat(100));
  await page.locator('[data-mode="preview"]').click();
  await page.locator('.md-preview').evaluate((element) => { element.scrollTop = 500; });
  await openAppearance(page);
  // 工具条收起时夹具会略上滑露出设置，仍应停在文中
  await expect.poll(() => page.locator('.md-preview').evaluate((element) => element.scrollTop)).toBeGreaterThan(400);
  await expect(page.locator('.reading-appearance-panel')).toBeVisible();
});
