import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLocalAsset } from '../../desktop/localAssets.js';

// 1x1 透明 PNG
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function withDocDir(run: (root: string, docPath: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'mojian-assets-'));
  try {
    const docDir = join(root, 'drafts');
    await mkdir(docDir, { recursive: true });
    const docPath = join(docDir, 'note.md');
    await writeFile(docPath, '# 笔记');
    await run(root, docPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('按文档目录解析相对路径（含 ../），返回图片 data URL', async () => {
  await withDocDir(async (root, docPath) => {
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'assets', 'flow.png'), PNG_BYTES);

    const asset = await readLocalAsset(docPath, '../assets/flow.png');

    assert.ok(asset);
    assert.match(asset!.dataUrl, /^data:image\/png;base64,/);
  });
});

test('svg 使用正确的 mime 类型', async () => {
  await withDocDir(async (root, docPath) => {
    await writeFile(join(root, 'drafts', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');

    const asset = await readLocalAsset(docPath, './icon.svg');

    assert.ok(asset);
    assert.match(asset!.dataUrl, /^data:image\/svg\+xml;base64,/);
  });
});

test('非图片扩展名一律拒绝', async () => {
  await withDocDir(async (root, docPath) => {
    await writeFile(join(root, 'drafts', 'secret.txt'), '机密');

    assert.equal(await readLocalAsset(docPath, './secret.txt'), null);
    assert.equal(await readLocalAsset(docPath, './note.md'), null);
  });
});

test('文件不存在或参数为空时返回 null 而不抛错', async () => {
  await withDocDir(async (_root, docPath) => {
    assert.equal(await readLocalAsset(docPath, './missing.png'), null);
    assert.equal(await readLocalAsset(docPath, ''), null);
    assert.equal(await readLocalAsset('', './a.png'), null);
  });
});
