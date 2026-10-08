export const READING_FONTS = ['system-default', 'system-serif', 'source-serif-4', 'local-jinkai', 'project-jinkai', 'imported-font'] as const;
export type ReadingFont = typeof READING_FONTS[number];
export function isReadingFont(value: unknown): value is ReadingFont {
  return READING_FONTS.includes(value as ReadingFont);
}
// Existing documents keep the previous local-first appearance. Explicit invalid
// values never become CSS; new readers get the offline bundled Latin face.
export function resolveReadingFont(saved: { readingFont?: unknown; content?: unknown } | null): ReadingFont {
  if (isReadingFont(saved?.readingFont)) return saved.readingFont;
  if (saved && !Object.hasOwn(saved, 'readingFont') && typeof saved.content === 'string') return 'local-jinkai';
  return 'source-serif-4';
}
export function readingScript(text: string): 'latin' | 'cjk' {
  const letters = text.match(/\p{Letter}/gu) || [];
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || [];
  return cjk.length > letters.length * 0.35 ? 'cjk' : 'latin';
}
