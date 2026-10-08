import { isTrustedEditorSender } from './editorState.js';
export { authorizeDesktopRequest } from '../scripts/agent-bridge-security.js';

// This value stays in the main process. Never expose a generic authenticated
// fetch, decrypt operation or the capability itself to the renderer/preload.
export function desktopRequestHeaders(details, window, origin, capability) {
  const headers = { ...details.requestHeaders };
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'x-mojian-desktop') delete headers[name];
  }
  const trusted = isTrustedEditorSender({ sender: window?.webContents, senderFrame: details.frame }, window, origin);
  try {
    const url = new URL(details.url);
    if (trusted && details.webContentsId === window.webContents.id
      && url.origin === origin && url.pathname.startsWith('/api/')) {
      headers['x-mojian-desktop'] = capability;
    }
  } catch {}
  return headers;
}

export async function invokeSettings(event, window, origin, store, operation, payload, testConnection) {
  if (!isTrustedEditorSender(event, window, origin)) return { ok: false, error: 'Untrusted editor' };
  try {
    if (operation === 'load') return { ok: true, value: await store.status() };
    if (operation === 'save') await store.updateProviders(payload);
    else if (operation === 'migrate' && payload?.consent === true) await store.migrateLegacy({ consent: true });
    else if (operation === 'test' && testConnection) return { ok: true, value: await testConnection(payload) };
    else return { ok: false, error: 'Unsupported settings operation' };
    return { ok: true, value: await store.status() };
  } catch {
    // Third-party OS errors can embed arguments. Keep the boundary error fixed.
    return { ok: false, error: '无法完成设置操作。请检查安全存储是否可用，设置文件是否完整，然后重试。' };
  }
}
