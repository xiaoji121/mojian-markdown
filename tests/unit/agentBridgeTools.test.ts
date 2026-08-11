import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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

test('只读配置不包含写文件或 shell', async () => {
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

test('获本轮写入授权后才提供当前文档替换工具，并在执行时逐次审批', async () => {
  await withProject(async ({ root, scratchFile }) => {
    const approvals = [];
    const tools = createBuiltinAgentTools({
      projectRoot: root,
      scratchFile,
      allowWrite: true,
      requestId: 'request-1',
      requestApproval: async (details) => {
        approvals.push(details);
        return true;
      }
    });
    const current = await tools.read_current_document.execute({ offset: 0, limit: 100 });
    const result = await tools.replace_current_document.execute({
      content: '# 已修改\n正文',
      expectedVersion: current.version,
      summary: '更新标题'
    });

    assert.equal(result.applied, true);
    assert.equal(await readFile(scratchFile, 'utf8'), '# 已修改\n正文');
    assert.equal(approvals.length, 1);
    assert.match(approvals[0].diff.preview, /[-+] # /);

    const readOnly = createBuiltinAgentTools({ projectRoot: root, scratchFile });
    assert.equal(readOnly.replace_current_document, undefined);
  });
});
