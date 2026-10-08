import { extractFile } from '@electron/asar';
import { join } from 'node:path';
// ASAR's directory traversal splits on the native path separator. Normalized
// inventory paths use '/', which otherwise fails for nested assets on Windows.
export function readArchiveFile(archive, path, extract = extractFile, joinPath = join) {
  return extract(archive, joinPath(...path.split('/')));
}
