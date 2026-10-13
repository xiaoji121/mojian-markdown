import { test, expect, openEditor } from './fixtures';

const content = '# 本地收尾验证\n\n' + Array.from({ length: 45 }, (_, i) =>
  `## 第 ${i + 1} 节\n\n合成文稿，用于核验滚动和排版。保留文字与批注，不调用外部服务。`).join('\n\n');

async function seed(page, values = {}) {
  await page.addInitScript(state => localStorage.setItem('md-editor-warm-v1', JSON.stringify(state)), {
    content, fileName: '本地合成验证.md', theme: 'dark', paperDark: 'snow', paperLight: 'snow',
    softenDarkPaper: false, fontSize: 18, locale: 'zh-CN', ...values
  });
}

for (const width of [900, 1100, 1440]) test(`PC ${width}: hidden reading toolbar leaves no empty lane`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await seed(page); await openEditor(page);
  await page.locator('[data-mode="preview"]').click();
  const preview = page.locator('.md-preview'), toolbar = page.locator('.reading-toolbar');
  await preview.evaluate(e => e.scrollTop = 600);
  await expect(toolbar).toHaveClass(/is-scrolled-away/);
  await expect.poll(async () => preview.evaluate(e => {
    const pane = e.parentElement!;
    const p = pane.getBoundingClientRect();
    return document.elementFromPoint(p.x + p.width / 2, p.y + 8)?.closest('.md-preview') === e;
  })).toBe(true);
  await preview.evaluate(e => e.scrollTop = 0);
  await expect(toolbar).not.toHaveClass(/is-scrolled-away/);
  await expect.poll(async () => page.locator('.md-preview h1').evaluate(e =>
    e.getBoundingClientRect().top >= document.querySelector('.reading-toolbar')!.getBoundingClientRect().bottom
  )).toBe(true);
  await page.locator('.quick-appearance-toggle').click();
  await expect(page.locator('.quick-appearance-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.md-source')).toHaveValue(content);
});

test('wrapped reading tools clear the article; focus and reduced motion leave no strip', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await seed(page, { locale: 'en', softenDarkPaper: true }); await openEditor(page);
  await page.locator('[data-mode="preview"]').click();
  await page.locator('.header-actions button[data-i18n-aria-label="批注"]').click();
  const toolbar = page.locator('.reading-toolbar');
  await expect.poll(() => toolbar.evaluate(e => {
    const r = e.getBoundingClientRect();
    return [...e.querySelectorAll('button')].filter(b => b.getClientRects().length).every(b => {
      const x = b.getBoundingClientRect(); return x.bottom <= r.bottom && x.right <= r.right;
    });
  })).toBe(true);
  await expect.poll(() => page.locator('.md-preview h1').evaluate(e =>
    e.getBoundingClientRect().top >= document.querySelector('.reading-toolbar')!.getBoundingClientRect().bottom
  )).toBe(true);
  await page.locator('.comments-panel .panel-close').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.md-preview').evaluate(e => e.scrollTop = 500);
  await expect(toolbar).toHaveClass(/is-scrolled-away/);
  await page.locator('.md-preview').evaluate(e => e.scrollTop = 0);
  await page.locator('.focus-toggle-btn').click();
  await expect(page.locator('.preview-pane')).toHaveClass(/preview-pane-fullscreen/);
  await page.locator('.md-preview').evaluate(e => e.scrollTop = 500);
  await expect(toolbar).toHaveClass(/is-scrolled-away/);
  await expect(page.locator('.focus-exit-sticky')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-mode="split"]').click();
  await expect(toolbar).not.toHaveClass(/is-scrolled-away/);
  await expect(page.locator('.md-source')).toHaveValue(content);
});

for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) test(`PC ${locale}: one separator between theme and reading settings`, async ({ page }) => {
  await seed(page, { locale }); await openEditor(page);
  await page.locator('.workspace-settings-button').click();
  await page.locator('[data-settings-tab="reading"]').click();
  const lines = await page.locator('.workspace-settings').evaluate(panel => {
    const row = getComputedStyle(panel.querySelector('.appearance-interface-theme')!);
    const heading = getComputedStyle(panel.querySelector('.appearance-reading-heading')!);
    return Number.parseFloat(row.borderBottomWidth) + Number.parseFloat(heading.borderTopWidth);
  });
  expect(lines).toBe(1);
});
