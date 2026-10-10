import { test, expect, openEditor, setSource, openAppearance } from './fixtures';

for (const immersive of [false, true]) {
  test(`global settings stay reachable mid-article without changing scroll or content (immersive=${immersive})`, async ({ page }, testInfo) => {
    await openEditor(page);
    const content = '# 全局设置\n\n' + '正文段落保持原样。\n\n'.repeat(100);
    await setSource(page, content);
    await page.locator('[data-mode="preview"]').click();
    if (immersive) await page.getByRole('button', { name: '沉浸式阅读', exact: true }).click();
    const preview = page.locator('.md-preview');
    await preview.evaluate(element => { element.scrollTop = 700; });
    await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBe(700);
    await openAppearance(page);
    const panel = page.locator('.reading-appearance-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.preview-pane .appearance-toggle')).toHaveCount(0);
    await expect(page.locator('.preview-pane .reading-appearance-panel')).toHaveCount(0);
    // 工具条下滑收起后，夹具会略上滑露出设置；仍应停在文中而非回顶
    await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBeGreaterThan(500);
    await expect(page.locator('.md-source')).toHaveValue(content);
    await page.screenshot({ path: testInfo.outputPath(`global-settings-midscroll-${immersive}.png`) });
    const previousTheme = await page.locator('body').getAttribute('data-theme');
    await page.locator('.appearance-theme').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', previousTheme === 'dark' ? 'light' : 'dark');
    await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBeGreaterThan(500);
    await page.locator('.font-inc').click();
    await expect(preview).toHaveCSS('font-size', '17px');
    await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('.md-source')).toHaveValue(content);
    await page.screenshot({ path: testInfo.outputPath(`global-settings-changed-${immersive}.png`) });
    await preview.evaluate(element => { element.scrollTop = 900; });
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('.workspace-settings-button:visible, .reading-toolbar-settings:visible, .focus-settings-button:visible')).toBeFocused();
    // Esc 后若工具条仍收起，焦点可能落在可见设置钮；滚动可能因露出过工具条略小于 900
    await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBeGreaterThan(800);
    await expect(page.locator('.preview-pane')).toHaveClass(immersive ? /preview-pane-fullscreen/ : /^preview-pane$/);
  });
}

test('global settings work in source-only mode and fit short narrow screens', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await openEditor(page);
  await page.locator('[data-mode="editor"]').click();
  await openAppearance(page);
  await expect(page.locator('.editor-main')).toHaveClass(/editor-mode-active/);
  const panel = page.locator('.reading-appearance-panel');
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(520);
  await page.locator('.reading-font-select').selectOption('system-serif');
  await page.getByRole('button', { name: '放大字号', exact: true }).click();
  await expect(page.locator('.md-preview')).toHaveCSS('font-size', '17px');
  await page.screenshot({ path: testInfo.outputPath('global-settings-short-screen.png') });
  await page.locator('.reading-appearance-panel .appearance-close').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.workspace-settings-button:visible, .reading-toolbar-settings:visible, .focus-settings-button:visible')).toBeFocused();
});

for (const width of [390, 1440]) {
  for (const wide of [false, true]) {
    test(`immersive global menu leaves exit focus accessible at width ${width} (wide=${wide})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await openEditor(page);
      // Set the global width preference before entering immersive mode, including
      // on mobile where the width control is intentionally hidden.
      if (wide) {
        await page.setViewportSize({ width: 1440, height: 844 });
        await openAppearance(page);
        await page.locator('.immersive-wide-toggle').click();
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width, height: 844 });
      }
      await page.locator('[data-mode="preview"]').click();
      const immersive = page.getByRole('button', { name: '沉浸式阅读', exact: true });
      await immersive.click();
      await expect(page.locator('.focus-settings-button')).toBeHidden();
      const settings = page.locator('.reading-toolbar-settings');
      const exit = page.locator('.focus-exit-sticky');
      await expect(exit).toBeVisible();
      await expect(settings).toBeVisible();
      const settingsBox = (await settings.boundingBox())!;
      const exitBox = (await exit.boundingBox())!;
      await page.screenshot({ path: testInfo.outputPath(`immersive-controls-${width}-wide-${wide}.png`) });
      // 桌面：退出独占右上、与设置同行不重叠；窄屏：退出在上、工具条在下
      expect(exitBox.width).toBeGreaterThan(60);
      expect(exitBox.x + exitBox.width).toBeLessThanOrEqual(width - 15);
      if (width === 390) {
        await expect(exit.locator('.focus-exit-esc-hint')).toBeHidden();
        expect(exitBox.height).toBeGreaterThanOrEqual(44);
        expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(settingsBox.y - 8);
        await expect(page.locator('.view-mode-switcher')).toBeHidden();
      } else {
        expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(exitBox.x - 8);
      }
      await exit.click();
      await expect(page.locator('.preview-pane')).not.toHaveClass(/preview-pane-fullscreen/);
    });
  }
}

for (const viewport of [{ width: 390, height: 320 }, { width: 640, height: 400 }]) {
  test(`short-screen settings remain usable with 200%-equivalent reflow at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    // 640x400 CSS pixels matches the layout space of 1280x800 at 200% browser zoom.
    // Reducing the viewport exercises reflow without synthetic CSS zoom changing fixed units.
    await page.setViewportSize(viewport);
    await openEditor(page);
    await openAppearance(page);
    const panel = page.locator('.reading-appearance-panel');
    await page.locator('.reading-font-select').selectOption('system-serif');
    await page.getByRole('button', { name: '放大字号', exact: true }).click();
    await expect(page.locator('.md-preview')).toHaveCSS('font-size', '17px');
    await panel.evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`global-settings-reflow-${viewport.width}x${viewport.height}.png`) });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  });
}

test('reading preferences are global across new documents and reloads', async ({ page }) => {
  await openEditor(page);
  await openAppearance(page);
  await page.locator('.appearance-theme').click();
  const theme = await page.locator('body').getAttribute('data-theme');
  await page.locator('.reading-font-select').selectOption('system-serif');
  await page.locator('.font-inc').click();
  await page.locator('.paper-dot[data-paper="green"]').click();
  await page.locator('.immersive-wide-toggle').click();
  await page.keyboard.press('Escape');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '新建文档', exact: true }).click();
  await expect(page.locator('.md-source')).toHaveValue('');
  await setSource(page, '# 第二篇文档\n\n沿用全局排版偏好。');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('md-editor-warm-v1') || '{}').content)).toContain('第二篇文档');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'system-serif');
  await expect(page.locator('body')).toHaveAttribute('data-theme', theme!);
  await expect(page.locator('body')).toHaveAttribute('data-paper', 'green');
  await expect(page.locator('.md-preview')).toHaveCSS('font-size', '17px');
  await openAppearance(page);
  await expect(page.locator('.immersive-wide-toggle')).toHaveAttribute('aria-pressed', 'true');
});
