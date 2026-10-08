// Compatibility entry point: restricted fonts are never copied or removed.
// Vite bundles the explicitly licensed Source Serif binaries from src/fonts.
// Carry their exact copyright/license/provenance alongside extension assets.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const source = new URL('../public/fonts/source-serif-4/', import.meta.url);
const target = new URL('../extension/public/fonts/source-serif-4/', import.meta.url);
if (existsSync(source)) {
  mkdirSync(target, { recursive: true });
  for (const file of ['LICENSE.md', 'NOTICE.md', 'provenance.json']) {
    cpSync(new URL(file, source), new URL(file, target));
  }
}
console.log('extension fonts: licensed Source Serif notice copied; restricted fonts remain local-only');
