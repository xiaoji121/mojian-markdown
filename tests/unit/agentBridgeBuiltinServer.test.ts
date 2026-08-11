import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAgentBridge } from '../../scripts/agent-bridge.js';

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

