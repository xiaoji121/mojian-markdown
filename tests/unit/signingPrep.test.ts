import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replaceAll('\r\n', '\n');

test('production electron-builder.yml reserves signing entitlements without forcing notarize', () => {
  const yaml = read('desktop/electron-builder.yml');
  assert.match(yaml, /entitlements:\s*desktop\/entitlements\.mac\.plist/);
  assert.match(yaml, /entitlementsInherit:\s*desktop\/entitlements\.mac\.plist/);
  assert.match(yaml, /hardenedRuntime:\s*true/);
  assert.doesNotMatch(yaml, /notarize:\s*true/);
  assert.match(yaml, /^win:\s*$/m);
  assert.match(yaml, /target:\s*nsis/);
  assert.ok(existsSync(resolve(root, 'desktop/entitlements.mac.plist')));
});

test('release config forces signing/notarize and stays separate from TEST identity', () => {
  const release = require('../../desktop/electron-builder.release.cjs');
  const testCfg = require('../../desktop/electron-builder.test.cjs');
  assert.equal(release.forceCodeSigning, true);
  assert.equal(release.mac.notarize, true);
  assert.equal(release.mac.hardenedRuntime, true);
  assert.equal(release.mac.entitlements, 'desktop/entitlements.mac.plist');
  assert.notEqual(release.appId, testCfg.appId);
  assert.notEqual(release.productName, testCfg.productName);
  assert.equal(testCfg.mac.identity, '-');
  assert.equal(testCfg.mac.notarize, false);
  assert.equal(testCfg.win.signAndEditExecutable, false);
});

test('signed-release workflow is manual-only and uses env placeholders, not committed secrets', () => {
  const workflow = read('.github/workflows/signed-release.yml');
  assert.match(workflow, /workflow_dispatch/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /CSC_LINK:\s*\$\{\{\s*secrets\.CSC_LINK\s*\}\}/);
  assert.match(workflow, /WIN_CSC_LINK:\s*\$\{\{\s*secrets\.WIN_CSC_LINK\s*\}\}/);
  assert.match(workflow, /APPLE_API_KEY/);
  assert.doesNotMatch(workflow, /BEGIN (CERTIFICATE|PRIVATE KEY)/);
  assert.match(workflow, /electron-builder\.release\.cjs/);
});

test('SIGNING.md draws engineer-ready vs user-certificate boundary', () => {
  const doc = read('docs/SIGNING.md');
  assert.match(doc, /工程师已就绪|Engineering ready/i);
  assert.match(doc, /等待用户|Waiting for (user )?certificate/i);
  assert.match(doc, /Apple Developer/);
  assert.match(doc, /Azure Trusted Signing|WIN_CSC_LINK/);
  assert.match(doc, /CSC_LINK/);
  assert.match(doc, /不要|Never.*commit|never commit/i);
});

test('landing copy marks TEST/unsigned status in zh-CN and en', async () => {
  const { landingCopy } = await import('../../src/landing/copy.ts');
  for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja'] as const) {
    const c = landingCopy[locale];
    assert.ok(c.desktopBadge, `${locale} needs desktopBadge`);
    assert.ok(c.desktopSigningNote, `${locale} needs desktopSigningNote`);
    assert.ok(c.signingDocsLink, `${locale} needs signingDocsLink`);
  }
  assert.match(landingCopy['zh-CN'].desktopBadge, /TEST|未签名|未簽署/);
  assert.match(landingCopy['zh-CN'].desktopBody, /正式签名|正式簽署|Gatekeeper|SmartScreen/);
  assert.match(landingCopy.en.desktopBadge, /TEST|unsigned/i);
  assert.match(landingCopy.en.desktopBody, /not a formally signed|unsigned|Gatekeeper|SmartScreen/i);
  assert.match(landingCopy.en.desktopSigningNote, /cannot|not ready|waiting|certificate/i);
});

test('package.json exposes signed release build without changing default desktop build', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['build:desktop'], /electron-builder\.yml/);
  assert.match(pkg.scripts['build:desktop:release'], /electron-builder\.release\.cjs/);
});
