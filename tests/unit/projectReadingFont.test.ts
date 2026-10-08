import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProjectReadingFont, PROJECT_FONT_RELATIVE_PATH } from '../../desktop/projectReadingFont.js';

function fixtureBytes() {
  const bytes = Buffer.alloc(64); bytes.write('wOF2'); bytes.writeUInt32BE(64, 8); return bytes;
}
async function fixture(run: (root: string, font: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'project-font-'));
  const font = join(root, ...PROJECT_FONT_RELATIVE_PATH.split('/'));
  await mkdir(join(font, '..'), { recursive: true });
  try { await run(root, font); } finally { await rm(root, { recursive: true, force: true }); }
}

test('only a trusted unpackaged request reads the fixed existing font:fetch subset', async () => {
  await fixture(async (root, font) => {
    await writeFile(font, fixtureBytes());
    const result = await readProjectReadingFont({ appRoot: root, packaged: false, trusted: true });
    assert.equal(result.status, 'available');
    assert.equal(result.source, 'project-subset');
    assert.equal(result.dataUrl, 'data:font/woff2;base64,' + fixtureBytes().toString('base64'));
    for (const flags of [{ packaged: true, trusted: true }, { packaged: false, trusted: false }]) {
      assert.deepEqual(await readProjectReadingFont({ appRoot: root, ...flags }), { status: 'unavailable' });
    }
  });
});

test('missing, malformed and oversized project files fail closed without exposing file paths', async () => {
  await fixture(async (root, font) => {
    const read = () => readProjectReadingFont({ appRoot: root, packaged: false, trusted: true });
    assert.deepEqual(await read(), { status: 'unavailable' });
    for (const bytes of [Buffer.from('not a font'), Buffer.alloc(9 * 1024 * 1024), Buffer.alloc(64)]) {
      await writeFile(font, bytes);
      assert.deepEqual(await read(), { status: 'unavailable' });
    }
  });
});

test('a project file symlink is never followed', async () => {
  await fixture(async (root, font) => {
    const other = join(root, 'other.woff2'); await writeFile(other, fixtureBytes());
    try { await symlink(other, font); } catch (error: any) {
      if (process.platform === 'win32' && error.code === 'EPERM') return;
      throw error;
    }
    assert.deepEqual(await readProjectReadingFont({ appRoot: root, packaged: false, trusted: true }), { status: 'unavailable' });
  });
});

test('a named-pipe project subset is rejected before open can block', { skip: process.platform === 'win32' }, async () => {
  const { execFileSync } = await import('node:child_process');
  await fixture(async (root, font) => {
    execFileSync('mkfifo', [font]);
    assert.deepEqual(await readProjectReadingFont({ appRoot: root, packaged: false, trusted: true }), { status: 'unavailable' });
  });
});
