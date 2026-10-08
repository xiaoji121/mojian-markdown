// Desktop HTTP is an untrusted transport. Only main-process injected capability
// requests from the app frame may use it; random ports and CORS are not auth.
import { timingSafeEqual } from 'node:crypto';
export function authorizeDesktopRequest(req, origin, capability) {
  let expected;
  try { expected = new URL(origin); } catch { return false; }
  if (req.headers.host !== expected.host) return false;
  if (req.headers.origin !== undefined && req.headers.origin !== expected.origin) return false;
  const supplied = req.headers['x-mojian-desktop'];
  if (typeof supplied !== 'string' || typeof capability !== 'string' || !capability) return false;
  const a = Buffer.from(supplied), b = Buffer.from(capability);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method)
    || (req.method === 'DELETE' && (Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding']))) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return false;
  }
  return true;
}
