import { test, expect, openEditor, setSource } from './fixtures';

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
  await expect(tools.getByRole('button')).toHaveCount(3);
  const title = await page.locator('.md-preview h1').boundingBox();
  expect(title!.y).toBeGreaterThan(bounds!.y + bounds!.height);
  await page.locator('[data-mode="split"]').click();
  await expect(page.getByRole('group', { name: 'Markdown 格式' })).toBeVisible();
});

test('顶栏只有一个更多菜单，主题从排版调整，搜索与导出从菜单进入', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('.app-header').getByRole('button', { name: '切换亮色或暗黑主题' })).toHaveCount(0);
  await expect(page.locator('.app-header').getByRole('button', { name: '打开设置' })).toHaveCount(0);
  await page.getByRole('button', { name: '阅读排版', exact: true }).click();
  const before = await page.locator('body').getAttribute('data-theme');
  await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', before === 'dark' ? 'light' : 'dark');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '查找文档', exact: false }).click();
  await expect(page.locator('.search-input').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '导出长图', exact: true }).click();
  await expect(page.locator('.longimg-overlay')).toBeVisible();
});

test('更多菜单可用方向键和 Esc 操作，阅读模式保留快捷搜索', async ({ page }) => {
  await openEditor(page);
  const more = page.getByRole('button', { name: '更多操作', exact: true });
  await more.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: '新建文档', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await expect(page.locator('.file-menu')).toBeHidden();
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
    const before = await tools.boundingBox();
    await preview.evaluate((element) => { element.scrollTop = 16; });
    await expect.poll(async () => (await tools.boundingBox())!.y).toBeCloseTo(before!.y - 16, 0);
    await preview.evaluate((element) => { element.scrollTop = 400; });
    await expect(tools).toBeHidden();
    await page.mouse.move(900, 5);
    await expect(tools).toBeHidden();
    await preview.evaluate((element) => { element.scrollTop = 0; });
    await expect(tools).toBeVisible();
    await page.getByRole('button', { name: '阅读排版', exact: true }).click();
    await expect(page.locator('.reading-appearance-panel')).toBeVisible();
  });
}

test('滚动后从更多菜单打开排版，会回到工具组所在的文章顶部', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# 菜单排版\n\n' + '段落。\n\n'.repeat(100));
  await page.locator('[data-mode="preview"]').click();
  await page.locator('.md-preview').evaluate((element) => { element.scrollTop = 500; });
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '阅读排版', exact: true }).click();
  await expect.poll(() => page.locator('.md-preview').evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator('.reading-appearance-panel')).toBeVisible();
});

test('桌面模式切换以窗口居中，不受文档名与侧栏影响', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  const switcher = page.getByRole('group', { name: '编辑器视图' });
  const center = async () => { const b = await switcher.boundingBox(); return b!.x + b!.width / 2; };
  expect(await center()).toBeCloseTo(720, 0);
  await page.locator('.file-name').evaluate((el) => { el.textContent = '很长的文档名称_'.repeat(20) + '.md'; });
  await page.locator('body').evaluate((el) => el.classList.add('agent-bridge-enabled'));
  const left = await page.locator('.header-brand').boundingBox();
  const middle = await switcher.boundingBox();
  expect(left!.x + left!.width).toBeLessThan(middle!.x);
  expect(await center()).toBeCloseTo(720, 0);
  await page.getByRole('button', { name: '最近阅读', exact: true }).click();
  expect(await center()).toBeCloseTo(720, 0);
});

test('窄屏顶栏三组内容不重叠，模式切换仍可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await page.locator('body').evaluate((el) => el.classList.add('agent-bridge-enabled'));
  const left = await page.locator('.header-brand').boundingBox();
  const middle = await page.getByRole('group', { name: '编辑器视图' }).boundingBox();
  const right = await page.locator('.header-actions').boundingBox();
  expect(left!.x + left!.width).toBeLessThanOrEqual(middle!.x);
  expect(middle!.x + middle!.width).toBeLessThanOrEqual(right!.x);
  expect(right!.x + right!.width).toBeLessThanOrEqual(390);
  await page.locator('[data-mode="preview"]').click();
  await expect(page.locator('.md-source')).toBeHidden();
});
