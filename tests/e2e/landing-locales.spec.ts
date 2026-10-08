import { test, expect, setSource } from './fixtures';
for (const [locale, title, open] of [['zh-CN', '墨笺 Markdown', '打开编辑器'], ['zh-TW','墨箋 Markdown','開啟編輯器'], ['en','Mojian Markdown','Open editor'], ['ja','墨箋 Markdown','エディターを開く']]) {
  test(`${locale} landing is shareable without JavaScript`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${baseURL}/${locale}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#landing-page h1')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://yuxizhai.com/md-editor/${locale}/`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', await page.title());
    await expect(page.locator('.landing-languages a')).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-nojs.png`), fullPage: true });
    await context.close();
  });
  test(`${locale} editor entry, return and browser history keep document`, async ({ page }) => {
    await page.goto(`/${locale}/`);
    await page.locator('.landing-open').click();
    await expect(page.locator('.md-source')).toBeVisible();
    await expect(page.locator('.interface-language')).toHaveValue(locale);
    await setSource(page, '# Keep my draft\n\nUntouched across navigation.');
    await page.locator('.brand-mark').click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#landing-page')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.md-source')).toHaveValue('# Keep my draft\n\nUntouched across navigation.');
    await page.goForward();
    await expect(page.locator('#landing-page')).toBeVisible();
  });
}
test('locale links are keyboard accessible on mobile and at 200% sizing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/en/');
  const japanese = page.locator('.landing-languages a[lang="ja"]');
  await japanese.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ja\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await page.screenshot({ path: testInfo.outputPath('landing-ja-mobile.png'), fullPage: true });
  await page.locator('body').evaluate(node => node.style.zoom = '2');
  await expect(page.locator('.landing-languages a[lang="ja"]')).toBeInViewport();
  await expect(page.locator('.landing-open')).toBeInViewport();
  expect(await page.locator('#landing-page h1').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('landing-ja-mobile-200-percent.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goBack(); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
test('explicit saved editor language wins over a different landing route', async ({ page }) => {
  await page.goto('/en/#editor');
  await expect(page.locator('.interface-language')).toHaveValue('en');
  await page.locator('.interface-language').selectOption('ja');
  await setSource(page, '# Saved draft');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('md-editor-warm-v1') || '{}').locale)).toBe('ja');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('md-editor-warm-v1') || '{}').content)).toBe('# Saved draft');
  await page.goto('/zh-TW/#editor');
  await expect(page.locator('.interface-language')).toHaveValue('ja');
  await expect(page.locator('.md-source')).toHaveValue('# Saved draft');
  await expect(page.locator('html')).toHaveAttribute('lang','ja');
  await page.locator('.brand-mark').click();
  await expect(page.locator('html')).toHaveAttribute('lang','zh-TW');
});
test('desktop landing language navigation stays on the trusted root document', async ({ page }) => {
  await page.addInitScript(() => { window.mojianDesktop = {} as any; });
  await page.goto('/');
  await page.locator('.landing-languages a[lang="en"]').click();
  await expect(page).toHaveURL(/\/#landing-en$/);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('.landing-open')).toHaveText('Open editor');
  await page.locator('.landing-languages a[lang="ja"]').click();
  await expect(page).toHaveURL(/\/#landing-ja$/);
  await expect(page.locator('html')).toHaveAttribute('lang','ja');
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
});
test('changing landing locale preserves a draft with its save debounce still pending', async ({ page }) => {
  await page.goto('/en/#editor');
  await expect(page.locator('.md-source')).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await setSource(page, '# Immediate edit before choosing a language');
  await page.locator('.brand-mark').click();
  await page.locator('.landing-languages a[lang="ja"]').click();
  await expect(page).toHaveURL(/\/ja\/$/);
  await page.locator('.landing-open').click();
  await expect(page.locator('.md-source')).toHaveValue('# Immediate edit before choosing a language');
  await expect(page.locator('.interface-language')).toHaveValue('en');
});
test('root to locale to first editor resolves the original template image', async ({ page }) => {
  await page.goto('/');
  await page.locator('.landing-languages a[lang="en"]').click();
  await page.locator('.landing-open').click();
  await expect(page.locator('.md-source')).toBeVisible();
  await expect.poll(() => page.locator('.brand-mark img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
});
