import { expect } from '@playwright/test';
export async function assertImportedGlyphs(page) {
  const result = await page.evaluate(async () => {
    const names = ['Mojian Imported Reading Font', 'Source Serif 4'];
    const pixels: string[] = [];
    for (const name of names) {
      const faces = await document.fonts.load(`32px "${name}"`);
      if (!faces.length) throw new Error('Font did not load: ' + name);
      const canvas = document.createElement('canvas'); canvas.width = 440; canvas.height = 80;
      const context = canvas.getContext('2d')!;
      context.font = `32px "${name}"`; context.fillText('Reading Aa ffi 123', 10, 45);
      pixels.push(canvas.toDataURL());
    }
    return pixels;
  });
  expect(result[0]).toEqual(result[1]); // Same OFL bytes must produce the same real glyph pixels.
}
