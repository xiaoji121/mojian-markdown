import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { tool } from 'ai';
import { z } from 'zod';
import { createBuiltinModel } from '../../scripts/agent-bridge-providers.js';
import { runBuiltinAgent } from '../../scripts/agent-bridge-builtin-agent.js';

function sendChunks(res, chunks) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  chunks.forEach((chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`));
  res.end('data: [DONE]\n\n');
}

test('OpenAI-compatible adapter 完成流式工具调用闭环', async () => {
  let calls = 0;
  const server = createServer((_req, res) => {
    calls += 1;
    const base = { id: `chat-${calls}`, object: 'chat.completion.chunk', created: 1, model: 'mock-model' };
    if (calls === 1) {
      sendChunks(res, [
        { ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_current_document', arguments: '{}' } }] }, finish_reason: null }] },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }
      ]);
    } else {
      sendChunks(res, [
        { ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '读到了标题。' }, finish_reason: null }] },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }
      ]);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const model = createBuiltinModel('custom', {
      apiKey: 'test-key', model: 'mock-model', baseURL: `http://127.0.0.1:${port}/v1`
    });
    let toolCalls = 0;
    const result = await runBuiltinAgent({
      model, prompt: '读取标题',
      tools: {
        read_current_document: tool({
          description: '读取当前文档', inputSchema: z.object({}),
          execute: async () => { toolCalls += 1; return { content: '# 标题' }; }
        })
      },
      onDelta: () => {}
    });
    assert.equal(calls, 2);
    assert.equal(toolCalls, 1);
    assert.equal(result.answer, '读到了标题。');
    assert.equal(result.usage.totalTokens, 19);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

