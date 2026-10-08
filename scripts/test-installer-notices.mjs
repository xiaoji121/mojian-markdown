// Preserve complete installed license/notice texts, including bundled web code.
// No network, account data, or font downloads are used by this build step.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const output = [
  'Mojian Markdown TEST — UNSIGNED, NOT FOR PUBLIC RELEASE',
  'Project license: see LICENSE (PolyForm Noncommercial 1.0.0).',
  'These notices cover installed production dependencies and bundled Electron.',
  'No Canger/restrictively redistributable project font is included.',
  'Electron Chromium notices are also supplied beside the application.', ''
];
async function licenseFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      files.push(...await licenseFiles(directory, relative));
    } else if (entry.isFile() && /^(licen[cs]e|copying|notice)/i.test(entry.name)) files.push(relative);
  }
  return files.sort();
}
const entries = Object.entries(lock.packages).filter(([path, info]) => path && !info.dev);
entries.push(['node_modules/electron', lock.packages['node_modules/electron']]);
for (const [path, info] of entries.sort(([a], [b]) => a.localeCompare(b))) {
  const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  const names = await licenseFiles(path);
  const texts = [];
  for (const name of names) {
    texts.push(`${name}\n${await readFile(join(path, name), 'utf8')}`);
  }
  if (!texts.length) throw new Error(`Missing third-party license text: ${path}`);
  output.push(`\n===== ${manifest.name}@${info.version} (${manifest.license || info.license || 'see text'}) =====`, ...texts);
}
output.push('\n===== Bundled KaTeX font notices =====', await readFile('docs/licenses/KATEX-FONTS.txt', 'utf8'));
output.push('\n===== Bundled Source Serif 4 4.005 (OFL 1.1) =====',
  await readFile('public/fonts/source-serif-4/NOTICE.md', 'utf8'),
  await readFile('public/fonts/source-serif-4/LICENSE.md', 'utf8'),
  await readFile('public/fonts/source-serif-4/provenance.json', 'utf8'));
await writeFile('dist/THIRD_PARTY_NOTICES.txt', output.join('\n'));
console.log(`Included license and notice texts for ${entries.length} packages.`);
