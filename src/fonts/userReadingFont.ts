export type UserFontKind = 'project' | 'imported';
export type UserFontResult = {
  status: 'available' | 'unavailable' | 'error' | 'candidate' | 'cancelled';
  dataUrl?: string; fileName?: string; token?: string; error?: string; format?: string; byteLength?: number;
};
export type FontApi = (operation: 'load' | 'project' | 'choose' | 'commit' | 'cancel' | 'remove', payload?: { token: string }) => Promise<UserFontResult>;
const families = { project: 'Mojian Project Reading Font', imported: 'Mojian Imported Reading Font' };
const state: Record<UserFontKind, UserFontResult> = { project: { status: 'unavailable' }, imported: { status: 'unavailable' } };
const listeners = new Set<() => void>();
const ownedStyles: Partial<Record<UserFontKind, HTMLStyleElement>> = {};
let started: Promise<void> | null = null;
let revision = 0;
const versions: Record<UserFontKind, number> = { project: 0, imported: 0 };
export const readingFontRevision = () => revision;
export const userReadingFonts = () => state;
export function onUserReadingFonts(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function notify() { listeners.forEach(listener => listener()); }
export function validFontDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 45 * 1024 * 1024
    && /^data:font\/(?:woff2?|ttf|otf);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
export async function prepareReadingFont(kind: UserFontKind, result: UserFontResult) {
  if (!validFontDataUrl(result.dataUrl)) throw new Error('invalid-font');
  const face = new FontFace(families[kind], `url("${result.dataUrl}")`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([face.load(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('font-timeout')), 15000);
    })]);
  } finally { clearTimeout(timer); }
}
export async function activateReadingFont(kind: UserFontKind, result: UserFontResult, version = ++versions[kind]) {
  if (version !== versions[kind]) return;
  await prepareReadingFont(kind, result);
  if (version !== versions[kind]) return;
  let style = ownedStyles[kind];
  if (!style?.isConnected) {
    style = document.createElement('style'); style.dataset.userReadingFont = kind;
    document.head.appendChild(style); ownedStyles[kind] = style;
  }
  style.textContent = `@font-face { font-family: '${families[kind]}'; src: url("${result.dataUrl}"); font-style: normal; font-weight: 400; font-display: swap; }`;
  revision++;
  const loaded = await document.fonts.load(`16px "${families[kind]}"`);
  if (!loaded.length) throw new Error('invalid-font');
  if (version !== versions[kind]) return;
  state[kind] = { ...result, status: 'available' };
  notify();
}
export function clearReadingFont(kind: UserFontKind, result: UserFontResult = { status: 'unavailable' }) {
  versions[kind]++;
  ownedStyles[kind]?.remove();
  delete ownedStyles[kind];
  state[kind] = result;
  revision++;
  notify();
}
export function loadUserReadingFonts(api?: FontApi): Promise<void> {
  if (!api) return Promise.resolve();
  if (!started) started = Promise.all((['project', 'imported'] as const).map(async kind => {
    const version = versions[kind];
    try {
      const result = await api(kind === 'project' ? 'project' : 'load');
      if (version !== versions[kind]) return;
      if (result.status === 'available') await activateReadingFont(kind, result, version);
      else { state[kind] = result; notify(); }
    } catch { if (version === versions[kind]) { state[kind] = { status: 'error', error: 'invalid-font' }; notify(); } }
  })).then(() => {});
  return started;
}
