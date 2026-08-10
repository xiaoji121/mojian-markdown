import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentPrompt, prepareAgentContext, readAgentDocumentUpdate } from '../../scripts/agent-bridge-agent.js';

test('逐次写权限让 Agent 修改工作副本，修改结果可同步回当前文档', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-context-test-'));
  try {
    const root = join(dir, 'workspace');
    const repo = join(dir, 'repo');
    await mkdir(join(repo, '.git'), { recursive: true });
    const localPath = join(repo, '原文.md');
    await writeFile(localPath, '# 原文');
    const doc = { documentId: 'doc-1', fileName: '原文.md', content: '# 原文', localPath };

    const context = await prepareAgentContext({ root, doc, engine: 'claude', allowWrite: true, env: {} });
    assert.equal(context.allowWrite, true);
    assert.match(agentPrompt({ question: '直接修改原文档' }, doc, context), /唯一允许直接修改的当前文档工作副本/);

    await writeFile(context.scratchFile, '# 已修改');
    assert.equal(await readAgentDocumentUpdate(context, doc.content), '# 已修改');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('未授权写入时即使工作副本变化也不回写当前文档', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-context-test-'));
  try {
    const doc = { documentId: 'doc-2', fileName: '原文.md', content: '# 原文' };
    const context = await prepareAgentContext({ root: dir, doc, engine: 'claude', allowWrite: false, env: {} });
    await writeFile(context.scratchFile, '# 非授权修改');
    assert.equal(await readAgentDocumentUpdate(context, doc.content), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
