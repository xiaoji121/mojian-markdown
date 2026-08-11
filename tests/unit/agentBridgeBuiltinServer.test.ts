import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAgentBridge } from '../../scripts/agent-bridge.js';
import { documentVersion } from '../../scripts/agent-bridge-document-write.js';

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 4, text: 4, reasoning: 0 }
};

function textModel() {
  return {
    specificationVersion: 'v3', provider: 'test', modelId: 'builtin-test', supportedUrls: {},
    async doGenerate() { throw new Error('not used'); },
    async doStream() {
      return { stream: new ReadableStream({ start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: 't1' });
        controller.enqueue({ type: 'text-delta', id: 't1', delta: '内置 Agent 回答' });
        controller.enqueue({ type: 'text-end', id: 't1' });
        controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage });
        controller.close();
      } }) };
    }
  };
}

function documentWriteModel() {
  let calls = 0;
  return {
    specificationVersion: 'v3', provider: 'test', modelId: 'builtin-write-test', supportedUrls: {},
    async doGenerate() { throw new Error('not used'); },
    async doStream() {
      calls += 1;
      if (calls === 1) {
        return { stream: new ReadableStream({ start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({
            type: 'tool-call', toolCallId: 'write-1', toolName: 'replace_current_document',
            input: JSON.stringify({
              content: '# 新正文', expectedVersion: documentVersion('# 旧正文'), summary: '更新正文'
            })
          });
          controller.enqueue({ type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage });
          controller.close();
        } }) };
      }
      return { stream: new ReadableStream({ start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: 't-write' });
        controller.enqueue({ type: 'text-delta', id: 't-write', delta: '正文已经更新。' });
        controller.enqueue({ type: 'text-end', id: 't-write' });
        controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage });
        controller.close();
      } }) };
    }
  };
}

async function readUntil(reader, pattern) {
  const decoder = new TextDecoder();
  let text = '';
  while (!pattern.test(text)) {
    const part = await reader.read();
    if (part.done) break;
    text += decoder.decode(part.value, { stream: true });
  }
  return text;
}

test('/api/chat 通过内置 API Agent 返回文本、工具进度与用量', async () => {
  const root = await mkdtemp(join(tmpdir(), 'builtin-bridge-'));
  const bridge = await startAgentBridge({ port: 0, root, builtinModelFactory: textModel });
  try {
    await fetch(`${bridge.url}/api/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kimi: { apiKey: 'test', model: 'kimi-k2.5' } })
    });
    const response = await fetch(`${bridge.url}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'kimi', mode: 'agent', question: '解释当前文档',
        document: { fileName: 'note.md', content: '# 标题' }
      })
    });
    const stream = await response.text();
    assert.match(stream, /"engine":"kimi"/);
    assert.match(stream, /内置 Agent 回答/);
    assert.match(stream, /event: usage/);
    assert.match(stream, /"totalTokens":6/);
  } finally {
    await bridge.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('/api/chat 内置 Agent 修改当前文档时等待一次性审批并回传更新', async () => {
  const root = await mkdtemp(join(tmpdir(), 'builtin-write-bridge-'));
  const bridge = await startAgentBridge({ port: 0, root, builtinModelFactory: documentWriteModel });
  try {
    await fetch(`${bridge.url}/api/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kimi: { apiKey: 'test', model: 'kimi-k2.5' } })
    });
    const response = await fetch(`${bridge.url}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'kimi', mode: 'agent', allowWrite: true, question: '更新正文',
        document: { fileName: 'note.md', content: '# 旧正文' }
      })
    });
    const reader = response.body!.getReader();
    const beforeApproval = await readUntil(reader, /event: approval-required/);
    const approval = JSON.parse(beforeApproval.match(/event: approval-required\ndata: (.+)\n\n/)![1]);
    assert.match(approval.diff.preview, /- # 旧正文/);
    assert.match(approval.diff.preview, /\+ # 新正文/);

    const decision = await fetch(`${bridge.url}/api/approvals/${approval.approvalId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true, argsHash: approval.argsHash })
    });
    assert.equal(decision.ok, true);
    const rest = await readUntil(reader, /event: document-updated/);
    assert.match(rest, /# 新正文/);
    assert.match(rest, /正文已经更新/);
    await reader.cancel();
  } finally {
    await bridge.close();
    await rm(root, { recursive: true, force: true });
  }
});
