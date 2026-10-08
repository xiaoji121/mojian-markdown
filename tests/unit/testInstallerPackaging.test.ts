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
