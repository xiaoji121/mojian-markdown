import { expect, test } from '@playwright/test';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createReadingFontStore } from '../../desktop/readingFontStore.js';
import { openAppearance } from '../e2e/fixtures';
import { assertImportedGlyphs } from '../helpers/fontGlyphs';

export async function importedFontScenario(session, closeWindow) {
  const bytes = await readFile(new URL('../../src/fonts/source-serif-4/SourceSerif4Variable-Roman.ttf.woff2', import.meta.url));
  const file = join(session.root, '用户选择的 OFL 字体.woff2');
  const moved = join(session.root, '原始字体保持不变.woff2');
  await writeFile(file, bytes);
  let { app, page } = await session.launch();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, file);
  await openAppearance(page);
  await page.locator('.reading-font-import').click();
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'imported-font');
  await expect(page.locator('.reading-font-import-status')).toContainText('用户选择的 OFL 字体.woff2');
  await assertImportedGlyphs(page);
  const saved = await createReadingFontStore(join(session.root, '用户 数据')).load();
  expect(saved.status).toBe('available');
  expect(saved.dataUrl).toBe('data:font/woff2;base64,' + bytes.toString('base64'));
  const screenshot = test.info().outputPath('imported-font-native.png');
  await page.screenshot({ path: screenshot });
  await test.info().attach('imported-font-native', { path: screenshot, contentType: 'image/png' });
  await rename(file, moved); // App copy must remain usable without the original path.
  await closeWindow(app);
  ({ app, page } = await session.launch());
  await openAppearance(page);
  await expect(page.locator('body')).toHaveAttribute('data-reading-font', 'imported-font');
  await expect(page.locator('.reading-font-import-status')).toContainText('用户选择的 OFL 字体.woff2');
  await assertImportedGlyphs(page);
  await page.locator('.reading-font-remove').click();
  await expect(page.locator('.reading-font-import-status')).toContainText('原文件不变');
  expect(await createReadingFontStore(join(session.root, '用户 数据')).load()).toEqual({ status: 'unavailable' });
  expect(await readFile(moved)).toEqual(bytes);
  await closeWindow(app);
}
