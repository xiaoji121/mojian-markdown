import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateFontBytes } from './readingFontStore.js';

const LIMIT = 32 * 1024 * 1024;
export async function readSelectedFont(path) {
  if (!['.woff2', '.woff', '.ttf', '.otf'].includes(extname(path).toLowerCase())) throw new Error('invalid-font');
  const initial = await lstat(path);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.size < 12) throw new Error('invalid-font');
  if (initial.size > LIMIT) throw new Error('too-large');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (process.platform === 'win32' ? 0 : constants.O_NONBLOCK || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 12) throw new Error('invalid-font');
    if (stat.size > LIMIT) throw new Error('too-large');
    const bytes = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size !== stat.size) throw new Error('invalid-font');
    const font = bytes.subarray(0, size);
    validateFontBytes(font);
    return font;
  } finally { await handle.close(); }
}

function safeName(path) {
  return basename(path).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 120) || 'font';
}
const failure = (error) => ({ status: 'error', error: ['invalid-font', 'too-large'].includes(error?.message) ? error.message : 'read-failed' });

// The renderer never supplies a file path or bytes. One short-lived candidate
// comes only from a native picker; commit follows successful renderer decoding.
export function createReadingFontHandler({ isTrusted, store, chooseFile, projectFont, readSelected = readSelectedFont, now = Date.now }) {
  let candidate = null;
  let choosing = false;
  let generation = 0;
  async function choose(event) {
    if (choosing) return { status: 'error', error: 'busy' };
    choosing = true;
    const version = ++generation;
    candidate = null;
    try {
      const path = await chooseFile();
      if (version !== generation) return { status: 'cancelled' };
      if (!isTrusted(event)) return { status: 'error', error: 'untrusted' };
      if (!path) return { status: 'cancelled' };
      const bytes = await readSelected(path);
      if (version !== generation) return { status: 'cancelled' };
      if (!isTrusted(event)) return { status: 'error', error: 'untrusted' };
      const { format, mimeType } = validateFontBytes(bytes);
      candidate = { token: randomUUID(), bytes, fileName: safeName(path), sender: event.sender, at: now() };
      return { status: 'candidate', token: candidate.token, fileName: candidate.fileName, format,
        dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` };
    } catch (error) { return failure(error); }
    finally { choosing = false; }
  }
  return async (event, operation, payload) => {
    if (!isTrusted(event)) return { status: 'error', error: 'untrusted' };
    if (operation === 'commit') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => key !== 'token')) {
        return { status: 'error', error: 'invalid-request' };
      }
      const current = candidate;
      if (!current || current.token !== payload.token || current.sender !== event.sender || now() - current.at > 300_000) {
        return { status: 'error', error: 'invalid-request' };
      }
      candidate = null;
      return store.importFont(current.bytes, current.fileName);
    }
    if (payload !== undefined) return { status: 'error', error: 'invalid-request' };
    if (operation === 'load') return store.load();
    if (operation === 'project') return projectFont(event);
    if (operation === 'choose') return choose(event);
    if (operation === 'cancel') { generation++; candidate = null; return { status: 'cancelled' }; }
    if (operation === 'remove') { generation++; candidate = null; return store.remove(); }
    return { status: 'error', error: 'invalid-request' };
  };
}
