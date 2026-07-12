// Copies the optional Canger JinKai subset (fetched via `npm run font:fetch`)
// into the extension's public dir so the reader page can use the real Mojian
// reading font. The font is not distributed with the repo; when it is absent
// the reader falls back to system fonts and this script just cleans up any
// stale copy.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public/fonts/canger-jinkai-04/cejk-subset.woff2');
const TARGET_DIR = join(ROOT, 'extension/public/fonts');
const TARGET = join(TARGET_DIR, 'cejk-subset.woff2');

if (existsSync(SOURCE)) {
  mkdirSync(TARGET_DIR, { recursive: true });
  copyFileSync(SOURCE, TARGET);
  console.log('extension font: bundled Canger JinKai subset');
} else {
  rmSync(TARGET_DIR, { recursive: true, force: true });
  console.log('extension font: no local subset (npm run font:fetch), falling back to system fonts');
}
