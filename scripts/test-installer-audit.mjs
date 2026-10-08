// Inspect the actual archive, not merely the packaging configuration.
import { listPackage, extractFile } from '@electron/asar';
import { access } from 'node:fs/promises';
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
const metadata = JSON.parse(extractFile(archive, 'package.json').toString());
if (metadata.name !== 'mojian-markdown-test' || metadata.productName !== 'Mojian Markdown TEST') throw new Error('TEST userData identity missing');
await access(join(resources, 'licenses/LICENSES.chromium.html'));
console.log(`Archive audit passed: ${names.length} entries; license and Chromium notices present.`);
