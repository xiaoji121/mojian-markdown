import { test, expect, openEditor } from './fixtures';

test('editor starts offline with the local preferred font and no Canger download', async ({ page }) => {
  const downloads: string[] = [];
  page.on('request', (request) => {
    if (/cejk|weread|canger-jinkai/i.test(request.url())) downloads.push(request.url());
  });
  await openEditor(page);
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
