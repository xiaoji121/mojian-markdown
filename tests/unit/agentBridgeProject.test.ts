import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRootFor } from '../../scripts/agent-bridge-project.js';

async function withTempTree(run: (root: string) => Promise<void>) {
  // macOS 的 tmpdir 是 /var → /private/var 软链，realpath 后比较才稳。
  const root = await mkdtemp(join(tmpdir(), 'project-root-test-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('projectRootFor 向上找到带 .git 的工程根', async () => {
  await withTempTree(async (root) => {
    await mkdir(join(root, 'repo', '.git'), { recursive: true });
    await mkdir(join(root, 'repo', 'docs', 'notes'), { recursive: true });
    const file = join(root, 'repo', 'docs', 'notes', '技术方案.md');
    await writeFile(file, '# 方案');

    assert.equal(projectRootFor(file), join(root, 'repo'));
  });
});

test('projectRootFor 认 package.json / CLAUDE.md 这类工程标记', async () => {
  await withTempTree(async (root) => {
    await mkdir(join(root, 'proj', 'sub'), { recursive: true });
    await writeFile(join(root, 'proj', 'CLAUDE.md'), '# 项目说明');
    const file = join(root, 'proj', 'sub', 'note.md');
    await writeFile(file, '# note');

    assert.equal(projectRootFor(file), join(root, 'proj'));
  });
});

test('projectRootFor 找不到标记时回落到文件所在目录', async () => {
  await withTempTree(async (root) => {
    const dir = join(root, 'loose');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'note.md');
    await writeFile(file, '# note');

    assert.equal(projectRootFor(file), dir);
  });
});

test('projectRootFor 拒绝非绝对路径与不存在的目录（不能拿去当 cwd）', () => {
  // 网页版的 localPath 可能是「文件夹名/相对路径」这种展示用路径，绝不能当工作目录。
  assert.equal(projectRootFor('墨剑文档/技术方案.md'), '');
  assert.equal(projectRootFor(''), '');
  assert.equal(projectRootFor(undefined), '');
  assert.equal(projectRootFor(join(tmpdir(), 'definitely-missing-dir-xyz', 'a.md')), '');
});
