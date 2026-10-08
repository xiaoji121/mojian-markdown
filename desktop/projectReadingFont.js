import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

export const PROJECT_FONT_RELATIVE_PATH = 'public/fonts/canger-jinkai-04/cejk-subset.woff2';
const LIMIT = 8 * 1024 * 1024;

// Existing developer output only. Never fetch, subset, install, or include it in
// a package. No renderer-supplied path crosses this boundary.
export async function readProjectReadingFont({ appRoot, packaged, trusted }) {
  if (packaged || !trusted) return { status: 'unavailable' };
  let handle;
  try {
    let path = await realpath(appRoot);
    for (const part of PROJECT_FONT_RELATIVE_PATH.split('/')) {
      path = join(path, part);
      if ((await lstat(path)).isSymbolicLink()) return { status: 'unavailable' };
    }
    const initial = await lstat(path);
    if (!initial.isFile() || initial.size < 48 || initial.size > LIMIT) return { status: 'unavailable' };
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)
      | (process.platform === 'win32' ? 0 : constants.O_NONBLOCK || 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 48 || stat.size > LIMIT) return { status: 'unavailable' };
    const buffer = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    const bytes = buffer.subarray(0, size);
    if (size !== stat.size || bytes.toString('ascii', 0, 4) !== 'wOF2' || bytes.readUInt32BE(8) !== size) {
      return { status: 'unavailable' };
    }
    return { status: 'available', source: 'project-subset', fileName: 'cejk-subset.woff2',
      dataUrl: 'data:font/woff2;base64,' + bytes.toString('base64') };
  } catch { return { status: 'unavailable' }; }
  finally { await handle?.close().catch(() => {}); }
}
