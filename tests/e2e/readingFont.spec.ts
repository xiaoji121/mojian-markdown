import { test, expect, openEditor, setSource } from './fixtures';

for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
  test(`reading font survives ${locale} UI changes and reload`, async ({ page }, testInfo) => {
    await openEditor(page);
    await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'source-serif-4');
    await page.locator('.appearance-toggle').click();
    await page.locator('.reading-font-select').selectOption('system-serif');
    await page.locator('.appearance-toggle').click();
    await page.locator('.interface-language').selectOption(locale);
    await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'system-serif');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'system-serif');
    await page.locator('.appearance-toggle').click();
    await expect(page.locator('.reading-font-select')).toHaveValue('system-serif');
    await page.locator('.reading-font-select').selectOption('local-jinkai');
    await expect(page.locator('.reading-font-note')).toBeVisible();
    await expect(page.locator('.reading-font-status')).not.toBeEmpty();
    await page.locator('.reading-font-select').selectOption('source-serif-4');
    await expect(page.locator('.reading-font-note')).toBeHidden();
    await page.locator('.appearance-toggle').click();
    await setSource(page, '# Reading 阅读 閱讀 読む\n\nRead and think with **bold**, *italic*, ***bold italic*** and `code()`.\n\n日本語の文章。中文阅读与思考。');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`reading-font-${locale}.png`), fullPage: true });
  });
}

test('offline bundled roman, bold and italic load; prose, code and UI stay separate', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# Reading 阅读 閱讀 読む\n\nA quiet paragraph with **bold**, *italic*, ***bold italic*** and `code()`.\n\n日本語の文章。中文阅读与思考。');
  await expect(page.locator('.md-preview')).toHaveAttribute('data-reading-script', 'latin');
  const result = await page.evaluate(async () => {
    const loaded = await Promise.all([
      document.fonts.load('400 16px "Source Serif 4"'),
      document.fonts.load('italic 700 16px "Source Serif 4"'),
    ]);
    await document.fonts.ready;
    const family = (selector: string) => getComputedStyle(document.querySelector(selector)!).fontFamily;
    return { loaded: loaded.map(list => list.length), prose: family('.md-preview'), code: family('.md-preview code'), ui: family('.appearance-toggle'), brand: family('.brand-title'), format: family('.fmt-h') };
  });
  expect(result.loaded.every(count => count > 0)).toBe(true);
  expect(result.prose).toContain('Source Serif 4');
  expect(result.code).not.toContain('Source Serif 4');
  expect(result.ui).not.toContain('Source Serif 4');
  expect(result.brand).not.toContain('Source Serif 4');
  expect(result.format).not.toContain('Source Serif 4');
  await setSource(page, '# 日本語\n\n日本語の文章。中文阅读与思考。');
  await expect(page.locator('.md-preview')).toHaveAttribute('data-reading-script', 'cjk');
});

test('old draft migration preserves content, invalid font IDs cannot inject CSS', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('md-editor-warm-v1', JSON.stringify({ content: '# Existing', fontSize: 19 })));
  await openEditor(page);
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'local-jinkai');
  await expect(page.locator('.md-source')).toHaveValue('# Existing');
  await page.evaluate(() => localStorage.setItem('md-editor-warm-v1', JSON.stringify({ content: '# Existing', readingFont: 'url(https://example.invalid/evil)' })));
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'source-serif-4');
  await expect(page.locator('.md-source')).toHaveValue('# Existing');
});

test('long-image waits for bundled fonts and snapshots chosen face and document rhythm', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '# Font export\n\nReadable **bold** and *italic* mixed with 阅读 閱讀 読む.');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '导出长图', exact: true }).click();
  await expect(page.locator('.longimg-poster')).toBeVisible();
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const preview = getComputedStyle(document.querySelector('.md-preview')!);
    const poster = getComputedStyle(document.querySelector('.longimg-poster')!);
    return { preview: preview.fontFamily, poster: poster.fontFamily,
      previewRhythm: preview.getPropertyValue('--paper-line-height'), posterRhythm: poster.getPropertyValue('--paper-line-height'), fonts: document.fonts.status };
  });
  expect(result.poster).toEqual(result.preview);
  expect(result.posterRhythm).toEqual(result.previewRhythm);
  expect(result.fonts).toBe('loaded');
  const download = page.waitForEvent('download');
  await page.locator('.longimg-save').click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});

test('immediate export stays disabled until current font preparation settles', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const fonts = document.fonts as FontFaceSet & { releaseForTest?: () => void };
    Object.defineProperty(fonts, 'ready', { configurable: true,
      value: new Promise(resolve => { fonts.releaseForTest = () => resolve(fonts); }) });
  });
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '导出长图', exact: true }).click();
  await expect(page.locator('.longimg-poster')).toBeVisible();
  await expect(page.locator('.longimg-save')).toBeDisabled();
  await page.evaluate(() => (document.fonts as FontFaceSet & { releaseForTest?: () => void }).releaseForTest!());
  await expect(page.locator('.longimg-save')).toBeEnabled();
});
