import { test, expect, openEditor, openAppearance } from './fixtures';

test('explicit local reading choice stays offline with no Canger download', async ({ page }) => {
  const downloads: string[] = [];
  page.on('request', (request) => {
    if (/cejk|weread|canger-jinkai/i.test(request.url())) downloads.push(request.url());
  });
  await openEditor(page);
  await openAppearance(page);
  await page.locator('.reading-font-select').selectOption('local-jinkai');
  await page.keyboard.press('Escape');
  const font = await page.locator('.md-preview').evaluate((element) => getComputedStyle(element).fontFamily);
  expect(font).toContain('Mojian Local JinKai 04');
  const available = await page.evaluate(async () => {
    // A nonexistent local name must fail; CSS fallback never proves installation.
    try { await new FontFace('Missing probe', 'local("Mojian-Definitely-Missing-123456")').load(); return true; }
    catch { return false; }
  });
  expect(available).toBe(false);
  expect(downloads).toEqual([]);
  await expect(page.locator('.md-source')).toBeEditable();
});
