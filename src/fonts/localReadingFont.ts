// A local-only face: no font enumeration, permission prompt, network request or
// system installation. Keep this source in sync with theme/tokens.css.
export const LOCAL_READING_FONT_FAMILY = 'Mojian Local JinKai 04';
export const LOCAL_READING_FONT_SOURCE = 'local("TsangerJinKai04-W04"), local("TsangerJinKai04 W04"), local("仓耳今楷04 W04")';
export const READING_FONT_OFFICIAL_URL = 'https://www.tsanger.cn/product/43';
export type LocalReadingFontStatus = 'available' | 'unavailable' | 'unknown';
type FontFaceFactory = (family: string, source: string) => { load(): Promise<unknown> };

// FontFaceSet.check() may return true for fallback fonts. Instead load an
// isolated local-only face. Failure also includes privacy-restricted browsers,
// so callers must say "not detected", never assert "not installed".
export async function detectLocalReadingFont(
  createFace: FontFaceFactory | null = typeof FontFace === 'undefined'
    ? null : (family, source) => new FontFace(family, source),
  timeoutMs = 1500
): Promise<LocalReadingFontStatus> {
  if (!createFace) return 'unknown';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const face = createFace(LOCAL_READING_FONT_FAMILY, LOCAL_READING_FONT_SOURCE);
    return await Promise.race([
      face.load().then(() => 'available' as const, () => 'unavailable' as const),
      new Promise<'unknown'>((resolve) => { timer = setTimeout(() => resolve('unknown'), timeoutMs); })
    ]);
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}
