import { test, expect, openEditor, setSource } from './fixtures';

test('暗色工作区采用蓝灰纸面与紧凑顶栏，正文保持足够对比度', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await expect(page.locator('.md-preview')).toHaveCSS('background-color', 'rgb(39, 41, 52)');
  expect((await page.locator('.app-header').boundingBox())!.height).toBeLessThanOrEqual(48);
  const contrast = await page.locator('.md-preview').evaluate((element) => {
    const luminance = (value: string) => {
      const rgb = value.match(/\d+/g)!.slice(0, 3).map(Number).map((n) => {
        const c = n / 255;
        return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const style = getComputedStyle(element);
    return (luminance(style.color) + .05) / (luminance(style.backgroundColor) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(7);
});

test('纸色切换独立于工作区配色，暗色纸样与正文一致', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openEditor(page);
  const shellColor = await page.locator('.app-shell').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByRole('button', { name: '阅读排版', exact: true }).click();
  const ink = page.getByRole('button', { name: '纸色：墨黑', exact: true });
  await expect(ink).toHaveCSS('background-color', 'rgb(39, 41, 52)');
  await page.getByRole('button', { name: '纸色：米黄', exact: true }).click();
  await expect(page.locator('.md-preview')).toHaveCSS('background-color', 'rgb(240, 233, 209)');
  await expect(page.locator('.app-shell')).toHaveCSS('background-color', shellColor);
  await page.getByRole('button', { name: '切换亮色或暗黑主题' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.md-preview')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

for (const width of [390, 900, 1440]) {
  test(`工作区在 ${width}px 下保持工具可用与搜索高亮对齐`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openEditor(page);
    await setSource(page, '# 设计验证\n\n' + '让文字成为工作区的中心。'.repeat(12));
    await page.getByRole('button', { name: '搜索替换', exact: true }).click();
    await page.getByRole('textbox', { name: '搜索文本', exact: true }).fill('文字');
    await expect(page.locator('.source-highlight-layer mark').first()).toBeVisible();
    const typography = await page.locator('.md-source, .source-highlight-layer').evaluateAll((elements) =>
      elements.map((el) => {
        const css = getComputedStyle(el);
        return [css.padding, css.fontSize, css.lineHeight, css.fontFamily];
      }));
    expect(typography[0]).toEqual(typography[1]);
    await page.keyboard.press('Escape');
    await page.locator('[data-mode="preview"]').click();
    await expect(page.locator('.md-preview h1')).toHaveText('设计验证');
    await page.getByRole('button', { name: '更多操作', exact: true }).click();
    const menu = (await page.locator('.file-menu').boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
  });
}
