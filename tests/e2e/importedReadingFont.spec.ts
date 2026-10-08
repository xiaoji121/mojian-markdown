import { assertImportedGlyphs } from '../helpers/fontGlyphs';
import { readFileSync } from 'node:fs';
import { test, expect, openEditor, openAppearance, setSource } from './fixtures';
const font = readFileSync(new URL('../../src/fonts/source-serif-4/SourceSerif4Variable-Roman.ttf.woff2', import.meta.url));
const dataUrl = 'data:font/woff2;base64,' + font.toString('base64');
const italicDataUrl = 'data:font/woff2;base64,' + readFileSync(new URL('../../src/fonts/source-serif-4/SourceSerif4Variable-Italic.ttf.woff2', import.meta.url)).toString('base64');

async function installFontFixture(page, project = false) {
  await page.addInitScript(({ dataUrl, italicDataUrl, project }) => {
    let candidate: any = null;
    (window as any).mojianDesktop = {
      onMenu: () => {}, onOpenPath: () => {}, consumePendingOpen: async () => null,
      loadEditorState: () => ({ ok: true, state: JSON.parse(localStorage.getItem('md-editor-warm-v1') || 'null') }),
      saveEditorState: state => { localStorage.setItem('md-editor-warm-v1', JSON.stringify(state)); return { ok: true }; },
      readingFont: async (operation, payload) => {
        const stored = () => JSON.parse(localStorage.getItem('fixture-font-copy') || 'null');
        if (operation === 'project') return project ? { status: 'available', dataUrl, fileName: 'cejk-subset.woff2' } : { status: 'unavailable' };
        if (operation === 'load') return stored() || { status: 'unavailable' };
        if (operation === 'remove') { localStorage.removeItem('fixture-font-copy'); return { status: 'unavailable' }; }
        if (operation === 'cancel') { candidate = null; return { status: 'cancelled' }; }
        if (operation === 'choose') {
          const mode = localStorage.getItem('fixture-font-mode');
          if (mode === 'cancel') return { status: 'cancelled' };
          candidate = { status: 'candidate', token: 'fixture-token', fileName: 'OFL Source Serif fixture.woff2',
            dataUrl: mode === 'invalid' ? 'data:font/woff2;base64,AAAA' : mode === 'italic' ? italicDataUrl : dataUrl };
          return candidate;
        }
        if (operation === 'commit' && candidate?.token === payload?.token) {
          const result = { ...candidate, status: 'available' };
          localStorage.setItem('fixture-font-copy', JSON.stringify(result));
          localStorage.setItem('fixture-font-commits', String(Number(localStorage.getItem('fixture-font-commits') || 0) + 1));
          candidate = null; return result;
        }
        return { status: 'error' };
      }
    };
  }, { dataUrl, italicDataUrl, project });
}


test('imported font decodes, preserves exact glyphs, persists and exports without remote requests', async ({ page }, info) => {
  await installFontFixture(page);
  await openEditor(page); await openAppearance(page);
  await page.locator('.reading-font-import').click();
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'imported-font');
  await expect(page.locator('.reading-font-import-status')).toContainText('OFL Source Serif fixture.woff2');
  await assertImportedGlyphs(page);
  for (const locale of ['zh-TW', 'en', 'ja', 'zh-CN']) {
    await page.locator(`.interface-language-option[data-locale="${locale}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'imported-font');
  }
  await page.keyboard.press('Escape');
  await setSource(page, '# Imported font\n\nReading **bold**, *italic*, 中文 and 日本語 with `code()`.');
  await openAppearance(page); await page.locator('.reading-font-select').selectOption('imported-font');
  await page.reload(); await openAppearance(page);
  await expect(page.locator('.reading-font-import-status')).toContainText('OFL Source Serif fixture.woff2');
  await assertImportedGlyphs(page);
  await page.screenshot({ path: info.outputPath('imported-ofl-fixture.png') });
  await page.keyboard.press('Escape');
  await page.locator('.file-menu-toggle').click();
  await page.getByRole('menuitem', { name: '导出长图', exact: true }).click();
  await expect(page.locator('.longimg-save')).toBeEnabled();
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    (window as any).fontExportSvg = [];
    URL.createObjectURL = (value: Blob) => {
      if (value.type.startsWith('image/svg+xml')) (window as any).fontExportSvg.push(value.text());
      return create(value);
    };
  });
  const download = page.waitForEvent('download'); await page.locator('.longimg-save').click();
  const first = await download; expect(first.suggestedFilename()).toMatch(/\.png$/);
  const firstBytes = readFileSync((await first.path())!);
  expect(firstBytes.subarray(1, 4).toString()).toBe('PNG');
  expect(firstBytes.length).toBeGreaterThan(5000);
  const firstSvg = await page.evaluate(() => Promise.all((window as any).fontExportSvg));
  expect(firstSvg.join('')).toContain(dataUrl);
  expect(firstSvg.join('')).toContain('Mojian Imported Reading Font');
  await page.evaluate(() => localStorage.setItem('fixture-font-mode', 'italic'));
  await openAppearance(page); await page.locator('.reading-font-import').click();
  await expect(page.locator('.reading-font-import')).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.locator('.file-menu-toggle').click();
  await page.getByRole('menuitem', { name: '导出长图', exact: true }).click();
  await expect(page.locator('.longimg-save')).toBeEnabled();
  await page.evaluate(() => { (window as any).fontExportSvg = []; });
  const nextDownload = page.waitForEvent('download'); await page.locator('.longimg-save').click();
  const nextBytes = readFileSync((await (await nextDownload).path())!);
  expect(nextBytes.equals(firstBytes)).toBe(false);
  const nextSvg = await page.evaluate(() => Promise.all((window as any).fontExportSvg));
  const importedFace = nextSvg.join('').match(/@font-face\s*\{[^}]*Mojian Imported Reading Font[^}]*\}/)?.[0];
  expect(importedFace).toContain(italicDataUrl);
  expect(importedFace).not.toContain(dataUrl);
});

test('cancel and malformed fonts do not replace the old font; removing only clears app copy', async ({ page }) => {
  await installFontFixture(page); await openEditor(page); await openAppearance(page);
  await page.locator('.reading-font-import').click();
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'imported-font');
  const original = await page.evaluate(() => localStorage.getItem('fixture-font-copy'));
  for (const mode of ['cancel', 'invalid']) {
    await page.evaluate(value => localStorage.setItem('fixture-font-mode', value), mode);
    await page.locator('.reading-font-import').click();
    await expect(page.locator('.reading-font-import')).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('fixture-font-copy'))).toBe(original);
  }
  expect(await page.evaluate(() => localStorage.getItem('fixture-font-commits'))).toBe('1');
  await page.locator('.reading-font-remove').click();
  await expect(page.locator('.reading-font-import-status')).toContainText('原文件不变');
  expect(await page.evaluate(() => localStorage.getItem('fixture-font-copy'))).toBeNull();
});

test('project font has a distinct choice and never replaces an explicit system preference', async ({ page }) => {
  await installFontFixture(page, true); await openEditor(page); await openAppearance(page);
  await page.locator('.reading-font-select').selectOption('system-serif');
  await page.reload(); await openAppearance(page);
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'system-serif');
  await expect(page.locator('.reading-font-select option[value=project-jinkai]')).toBeEnabled();
  await page.locator('.reading-font-select').selectOption('project-jinkai');
  await expect(page.locator('.reading-font-project-status')).toContainText('cejk-subset.woff2');
  await expect(page.locator('.reading-font-note')).toBeHidden();
});
