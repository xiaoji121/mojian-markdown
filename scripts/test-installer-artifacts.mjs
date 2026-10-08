import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
const directory = process.argv[2] || 'release';
const files = (await readdir(directory)).filter(name => /-TEST-(win|mac)-(x64|arm64)\.(exe|dmg)$/.test(name)).sort();
if (!files.length) throw new Error('No versioned TEST installers found');
const checksums = [];
for (const name of files) checksums.push(`${createHash('sha256').update(await readFile(join(directory, name))).digest('hex')}  ${basename(name)}`);
await writeFile(join(directory, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
await writeFile(join(directory, 'TEST-BUILD.txt'), [
  'UNSIGNED TEST BUILD — NOT A PUBLIC RELEASE',
  `Source commit: ${process.env.GITHUB_SHA || 'local-unverified'}`,
  `Runner: ${process.platform}/${process.arch}`,
  'No Developer ID signing, notarization, release, tags, updater or live AI accounts.',
  'macOS uses only a local ad-hoc signature for test execution; no signing identity/account.',
  'Artifacts in this public repository are publicly accessible; they contain no private documents.',
  'Windows CI is Windows Server; Windows 10/11 physical install/SmartScreen remain manual checks.',
  'macOS CI does not prove downloaded-app Gatekeeper approval or notarization.',
  'Project license is PolyForm Noncommercial 1.0.0; see bundled LICENSE and third-party notices.', ''
].join('\n'));
console.log(checksums.join('\n'));
