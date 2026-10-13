import { expect, type Page } from '@playwright/test';

export const polishContent = '# 本地收尾验证\n\n' + Array.from({ length: 45 }, (_, i) =>
  `## 第 ${i + 1} 节\n\n合成文稿，用于核验滚动和排版。保留文字与批注，不调用外部服务。`).join('\n\n');

export async function readingFillsPane(page: Page) {
  await expect.poll(() => page.locator('.md-preview').evaluate(e => {
    const p = e.parentElement!.getBoundingClientRect();
    return document.elementFromPoint(p.x + p.width / 2, p.y + 8)?.closest('.md-preview') === e;
  })).toBe(true);
}

export async function exercisePolish(page: Page) {
  const preview = page.locator('.md-preview'), toolbar = page.locator('.reading-toolbar');
  for (const collapsed of [false, true]) {
    if (await page.locator('.document-sidebar').evaluate(e => e.classList.contains('is-collapsed')) !== collapsed) {
      await page.locator(collapsed ? '.document-sidebar-close' : '.document-toggle').click();
    }
    for (const mode of ['editor', 'split', 'preview']) {
      await page.locator(`[data-mode="${mode}"]`).click();
      expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
      if (mode === 'editor') continue;
      await preview.evaluate(e => e.scrollTop = 0);
      await expect(toolbar).not.toHaveClass(/is-scrolled-away/);
      const bounds = await toolbar.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(54);
      await preview.evaluate(e => { e.scrollTop = 100; e.scrollTop = 350; e.scrollTop = 900; });
      if (mode === 'preview') {
        await expect(toolbar).toHaveClass(/is-scrolled-away/);
        await readingFillsPane(page);
      } else await expect(toolbar).not.toHaveClass(/is-scrolled-away/);
      await preview.evaluate(e => e.scrollTop = 700);
      await expect(toolbar).not.toHaveClass(/is-scrolled-away/);
      await preview.evaluate(e => e.scrollTop = 0);
      await expect.poll(() => page.locator('.md-preview h1').evaluate(e =>
        e.getBoundingClientRect().top >= document.querySelector('.reading-toolbar')!.getBoundingClientRect().bottom
      )).toBe(true);
    }
  }
  for (let i = 0; i < 2; i++) {
    await page.locator('.pc-header-settings').click();
    await page.locator('[data-pc-preference="font"]').click();
    await page.locator('.pc-settings-footer .tbtn').click();
    await page.locator('[data-settings-tab="reading"]').click();
    await expect(page.locator('.workspace-settings')).toBeVisible();
    const lines = await page.locator('.workspace-settings').evaluate(panel =>
      parseFloat(getComputedStyle(panel.querySelector('.appearance-interface-theme')!).borderBottomWidth)
      + parseFloat(getComputedStyle(panel.querySelector('.appearance-reading-heading')!).borderTopWidth));
    expect(lines).toBe(1);
    await page.keyboard.press('Escape');
  }
}
