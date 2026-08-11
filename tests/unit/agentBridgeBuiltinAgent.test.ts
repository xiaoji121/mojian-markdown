import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tool } from 'ai';
import { z } from 'zod';
import { runBuiltinAgent } from '../../scripts/agent-bridge-builtin-agent.js';

const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 }
};

function streamOf(parts) {
  return new ReadableStream({
    start(controller) {
      parts.forEach((part) => controller.enqueue(part));
      controller.close();
    }
  });
}

function twoStepModel() {
  let calls = 0;
  return {
    specificationVersion: 'v3', provider: 'test', modelId: 'tool-model', supportedUrls: {},
    async doGenerate() { throw new Error('not used'); },
    async doStream() {
      calls += 1;
      if (calls === 1) {
        return { stream: streamOf([
          { type: 'stream-start', warnings: [] },
          { type: 'tool-call', toolCallId: 'call-1', toolName: 'read_current_document', input: '{}' },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage }
        ]) };
      }
      return { stream: streamOf([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: '文档标题是测试。' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage }
      ]) };
    },
    callCount: () => calls
  };
}

test('内置 Agent 执行多步工具循环，只流出最终文本和安全进度', async () => {
  const model = twoStepModel();
  const deltas: string[] = [];
  const progress: Array<{ label: string }> = [];
  let toolCalls = 0;
  const result = await runBuiltinAgent({
    model,
    prompt: '标题是什么？',
    tools: {
      read_current_document: tool({
        description: '读取当前文档',
        inputSchema: z.object({}),
        execute: async () => {
          toolCalls += 1;
          return { content: '# 测试' };
        }
      })
    },
    onDelta: (text) => deltas.push(text),
    onProgress: (item) => progress.push(item)
  });
  assert.equal(model.callCount(), 2);
  assert.equal(toolCalls, 1);
  assert.equal(result.answer, '文档标题是测试。');
  assert.deepEqual(deltas, ['文档标题是测试。']);
  assert.ok(progress.some((item) => item.label === '正在读取当前文档'));
  assert.equal(result.usage.inputTokens, 10);
  assert.equal(result.usage.outputTokens, 6);
});

