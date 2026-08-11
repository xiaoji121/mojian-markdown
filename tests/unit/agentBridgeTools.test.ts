import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuiltinAgentTools } from '../../scripts/agent-bridge-tools.js';

async function withProject(run) {
  const root = await mkdtemp(join(tmpdir(), 'builtin-tools-'));
  const outside = await mkdtemp(join(tmpdir(), 'builtin-outside-'));
  try {
    const scratchFile = join(root, '.reading-workspace', 'current.md');
    await mkdir(join(root, '.reading-workspace'), { recursive: true });
    await writeFile(scratchFile, '# 当前文档\n正文', 'utf8');
    await writeFile(join(root, 'README.md'), '# 项目说明', 'utf8');
    await writeFile(join(root, '.env'), 'SECRET=hidden', 'utf8');
    await writeFile(join(outside, 'secret.md'), 'outside', 'utf8');
    await symlink(join(outside, 'secret.md'), join(root, 'escape.md'));
    await run({ root, scratchFile });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
}

test('只读工具可分页读取当前文档与工程文件', async () => {
  await withProject(async ({ root, scratchFile }) => {
    const tools = createBuiltinAgentTools({ projectRoot: root, scratchFile });
    const current = await tools.read_current_document.execute({ offset: 0, limit: 20 });
    const readme = await tools.read_project_file.execute({ path: 'README.md', offset: 0, limit: 20 });
    assert.match(current.content, /当前文档/);
    assert.equal(readme.content, '# 项目说明');
  });
});

test('工程读取拒绝敏感文件、目录逃逸与软链接逃逸', async () => {
  await withProject(async ({ root, scratchFile }) => {
    const tools = createBuiltinAgentTools({ projectRoot: root, scratchFile });
    await assert.rejects(() => tools.read_project_file.execute({ path: '.env' }), /敏感文件/);
    await assert.rejects(() => tools.read_project_file.execute({ path: '../secret.md' }), /工程目录/);
    await assert.rejects(() => tools.read_project_file.execute({ path: 'escape.md' }), /工程目录/);
  });
});

test('首版工具集不包含写文件或 shell', async () => {
  await withProject(async ({ root, scratchFile }) => {
    const tools = createBuiltinAgentTools({ projectRoot: root, scratchFile });
    assert.deepEqual(Object.keys(tools).sort(), [
      'list_project_files',
      'read_current_document',
      'read_project_file',
      'search_project_text'
    ]);
  });
});

