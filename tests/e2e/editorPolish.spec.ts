import { test, expect, openEditor, openAppearance, setSource } from './fixtures';

test('排版面板集中调整纸色和字号，支持 Esc 和点击外部关闭', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByRole('button', { name: '纸色：米黄', exact: true })).toBeHidden();
  await openAppearance(page);
  await page.getByRole('button', { name: '纸色：米黄', exact: true }).click();
  await page.getByRole('button', { name: '放大字号', exact: true }).click();
  await expect(page.locator('.md-preview')).toHaveCSS('font-size', '17px');
  await expect(page.locator('body')).toHaveAttribute('data-paper', 'cream');
  await page.keyboard.press('Escape');
  await expect(page.locator('.reading-appearance-panel')).toBeHidden();
  await expect(page.locator('.workspace-settings-button')).toBeFocused();
  await openAppearance(page);
  await page.locator('.workspace-settings-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.reading-appearance-panel')).toBeHidden();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-paper', 'cream');
  await expect(page.locator('.md-preview')).toHaveCSS('font-size', '17px');
});

test('新用户得到与只读预览一致的说明和明确的草稿保存位置', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('.md-source')).not.toHaveValue(/实时双向同步|直接在右侧/);
  await setSource(page, '# 我的文章\n\n保存位置应该清楚。');
  await expect(page.locator('.app-footer')).toContainText('草稿已自动保存在此浏览器');
});

test('窄屏和沉浸阅读都能直接使用排版面板', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await page.locator('[data-mode="preview"]').click();
  await page.getByRole('button', { name: '沉浸式阅读', exact: true }).click();
  await openAppearance(page);
  await page.getByRole('button', { name: '纸色：米黄', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-paper', 'cream');
  const bounds = await page.locator('.reading-appearance-panel').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(page.locator('.preview-pane')).toHaveClass(/preview-pane-fullscreen/);
});
