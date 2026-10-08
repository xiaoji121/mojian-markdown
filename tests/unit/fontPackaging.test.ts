import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build, loadConfigFromFile } from 'vite';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

for (const configFile of ['vite.config.ts', 'extension/vite.config.ts']) {
  test(`${configFile} excludes generated restricted fonts while preserving open fonts and sources`, async () => {
    const temp = mkdtempSync(join(tmpdir(), 'mojian-font-build-'));
    const fixtures = ['fonts/canger-jinkai-04/cejk-subset.woff2', 'fonts/cejk.woff',
      'fonts/cejk-subset.woff2', 'fonts/open/NotoSans.woff2', 'fonts/KaTeX_Main-Regular.woff2', 'favicon.svg'];
    try {
      for (const file of fixtures) {
        const path = join(temp, 'public', file);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, `fixture: ${file}`);
      }
      writeFileSync(join(temp, 'index.html'), '<html><body>Font packaging fixture</body></html>');
      const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, new URL(configFile, root).pathname);
      assert.ok(loaded);
      await build({ ...loaded.config, configFile: false, root: temp, logLevel: 'silent',
        build: { outDir: join(temp, 'dist'), rollupOptions: { input: join(temp, 'index.html') } } });
      for (const file of fixtures) {
        const restricted = /canger|cejk/.test(file);
        assert.equal(existsSync(join(temp, 'dist', file)), !restricted, file);
        assert.equal(readFileSync(join(temp, 'public', file), 'utf8'), `fixture: ${file}`);
      }
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
}

test('CI workflows never fetch or cache restricted fonts', () => {
  for (const name of readdirSync(new URL('.github/workflows/', root))) {
    assert.doesNotMatch(read(`.github/workflows/${name}`), /font:fetch|fetch-font\.mjs|canger-font|Cache Canger font/);
  }
});

test('extension font preparation never copies or deletes user font files', () => {
  const temp = mkdtempSync(join(tmpdir(), 'mojian-font-copy-'));
  try {
    const files = ['scripts/copy-extension-font.mjs', 'public/fonts/canger-jinkai-04/cejk-subset.woff2',
      'extension/public/fonts/cejk-subset.woff2', 'extension/public/fonts/open.woff2'];
    for (const file of files) {
      mkdirSync(join(temp, file, '..'), { recursive: true });
      writeFileSync(join(temp, file), file.startsWith('scripts/') ? read(file) : file);
    }
    const result = spawnSync(process.execPath, [join(temp, files[0])], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    for (const file of files.slice(1)) assert.equal(readFileSync(join(temp, file), 'utf8'), file);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('production and test desktop packages exclude stale restricted assets, retaining KaTeX', () => {
  const yaml = read('desktop/electron-builder.yml');
  const patterns = [...yaml.matchAll(/^  - ['"]?(![^'"\n]+)['"]?$/gm)].map((match) => match[1]);
  const testConfig = createRequire(import.meta.url)(new URL('desktop/electron-builder.test.cjs', root).pathname);
  for (const exclusions of [patterns, testConfig.files.filter((file: string) => file.startsWith('!'))]) {
    for (const file of ['dist/fonts/canger-jinkai-04/cejk-subset.woff2', 'dist/fonts/cejk.woff', 'dist/assets/cejk-subset-abc.woff2']) {
      assert.ok(exclusions.some((pattern: string) => matchesGlob(file, pattern.slice(1))), file);
    }
    assert.ok(!exclusions.some((pattern: string) => matchesGlob('dist/assets/KaTeX_Main-Regular-abc.woff2', pattern.slice(1))));
  }
});

test('explicit restricted-font imports fail closed rather than being inlined or hashed', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'mojian-font-import-'));
  try {
    writeFileSync(join(temp, 'index.html'), '<link rel="stylesheet" href="/style.css">');
    writeFileSync(join(temp, 'style.css'), '@font-face { font-family: forbidden; src: url("./cejk-subset.woff2"); }');
    writeFileSync(join(temp, 'cejk-subset.woff2'), 'fixture');
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, new URL('vite.config.ts', root).pathname);
    assert.ok(loaded);
    await assert.rejects(build({ ...loaded.config, configFile: false, root: temp, logLevel: 'silent' }),
      /Restricted reading font/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
