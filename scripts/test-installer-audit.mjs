// Inspect the actual archive, not merely the packaging configuration.
import { listPackage, extractFile } from '@electron/asar';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const resources = process.argv[2];
if (!resources) throw new Error('Pass packaged resources directory');
const archive = join(resources, 'app.asar');
const names = listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
for (const required of ['LICENSE', 'dist/THIRD_PARTY_NOTICES.txt', 'desktop/main.js', 'desktop/preload.cjs', 'dist/index.html', 'dist/favicon.svg', 'scripts/agent-bridge.js', 'node_modules/undici/package.json']) {
  if (!names.includes(required)) throw new Error(`Missing packaged file: ${required}`);
}
for (const name of names) {
  if (!/^(desktop|dist|scripts|node_modules)(\/|$)|^(LICENSE|package.json)$/.test(name)) throw new Error(`Unexpected archive path: ${name}`);
  if (/canger|苍耳|fonts-src|(^|\/)\.env($|\.)|(^|\/)(\.git|uploads|\.workspace|agent-workspace|userData)(\/|$)/i.test(name)) throw new Error(`Forbidden package content: ${name}`);
  if (name.startsWith('dist/') && !/^dist\/(index.html|favicon.svg|THIRD_PARTY_NOTICES.txt|assets(?:\/.*)?)$/.test(name)) throw new Error(`Unexpected frontend asset: ${name}`);
}
if (!extractFile(archive, 'LICENSE').toString().includes('PolyForm Noncommercial')) throw new Error('Project license lost');
if (!extractFile(archive, 'dist/THIRD_PARTY_NOTICES.txt').toString().includes('UNSIGNED')) throw new Error('Third-party notices lost');
const fontProvenance = JSON.parse(await readFile('public/fonts/source-serif-4/provenance.json', 'utf8'));
const notices = extractFile(archive, 'dist/THIRD_PARTY_NOTICES.txt').toString();
const sourceLicense = await readFile('public/fonts/source-serif-4/LICENSE.md', 'utf8');
if (!notices.includes(sourceLicense)) throw new Error('Exact Source Serif copyright/license lost');
for (const font of fontProvenance.files) {
  const prefix = font.file.replace(/\.woff2$/, '-');
  const path = names.find(name => name.startsWith('dist/assets/' + prefix) && name.endsWith('.woff2'));
  if (!path) throw new Error(`Missing licensed font: ${font.file}`);
  const bytes = extractFile(archive, path);
  if (bytes.length !== font.bytes || createHash('sha256').update(bytes).digest('hex') !== font.sha256) {
    throw new Error(`Bundled font differs from official release: ${font.file}`);
  }
}
const metadata = JSON.parse(extractFile(archive, 'package.json').toString());
if (metadata.name !== 'mojian-markdown-test' || metadata.productName !== 'Mojian Markdown TEST') throw new Error('TEST userData identity missing');
await access(join(resources, 'licenses/LICENSES.chromium.html'));
console.log(`Archive audit passed: ${names.length} entries; license and Chromium notices present.`);
