import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('test installers have isolated identity, explicit targets and no publication', () => {
  const config = require('../../desktop/electron-builder.test.cjs');
  assert.equal(config.appId, 'com.yuxizhai.mojian-markdown.test');
  assert.equal(config.productName, 'Mojian Markdown TEST');
  assert.deepEqual(config.publish, null);
  assert.deepEqual(config.extraMetadata, { name: 'mojian-markdown-test', productName: 'Mojian Markdown TEST' });
  assert.deepEqual(config.fileAssociations, []);
  assert.deepEqual(config.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.deepEqual(config.mac.target, [{ target: 'dmg', arch: ['arm64', 'x64'] }]);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.runAfterFinish, false);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.ok(config.files.includes('LICENSE'));
  assert.ok(config.files.includes('dist/favicon.svg'));
  assert.ok(config.files.includes('desktop/preload.cjs'));
  assert.ok(config.files.includes('dist/THIRD_PARTY_NOTICES.txt'));
  assert.ok(!config.files.includes('dist/**'));
});

test('effective builder config does not inherit broad files or production associations', async () => {
  const { getConfig } = await import('app-builder-lib/out/util/config/config.js');
  const config = await getConfig(process.cwd(), 'desktop/electron-builder.test.cjs');
  assert.deepEqual(config.fileAssociations, []);
  const patterns = config.files.flatMap(entry => typeof entry === 'string' ? [entry] : entry.filter);
  assert.ok(!patterns.includes('dist/**'));
  assert.ok(!patterns.includes('desktop/**'));
  assert.ok(patterns.includes('desktop/preload.cjs'));
  assert.equal(config.mac.target.length, 1);
});

test('archive font inspection reads nested assets with native path separators', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, win32 } = await import('node:path');
  const { createPackage } = await import('@electron/asar');
  const { readArchiveFile } = await import('../../scripts/test-installer-archive.mjs');
  const root = await mkdtemp(join(tmpdir(), 'font-asar-'));
  try {
    await mkdir(join(root, 'input', 'dist', 'assets'), { recursive: true });
    await writeFile(join(root, 'input', 'dist', 'assets', 'font.woff2'), 'official-font-fixture');
    const archive = join(root, 'app.asar');
    await createPackage(join(root, 'input'), archive);
    assert.equal(readArchiveFile(archive, 'dist/assets/font.woff2').toString(), 'official-font-fixture');
    let extractedPath = '';
    readArchiveFile(archive, 'dist/assets/font.woff2', (_archive, path) => { extractedPath = path; return Buffer.alloc(0); }, win32.join);
    assert.equal(extractedPath, 'dist\\assets\\font.woff2');
  } finally { await rm(root, { recursive: true, force: true }); }
});
