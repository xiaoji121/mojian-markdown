import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAgentBridge } from '../../scripts/agent-bridge.js';

async function withBridge(options, run) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-test-'));
  const bridge = await startAgentBridge({ port: 0, root, ...options });
  try {
    await run(bridge);
  } finally {
    await bridge.close();
    await rm(root, { recursive: true, force: true });
  }
}

test('startAgentBridge 在随机端口启动并响应 /health', async () => {
  await withBridge({}, async (bridge) => {
    assert.ok(bridge.port > 0);
    assert.equal(bridge.url, `http://127.0.0.1:${bridge.port}`);
    const response = await fetch(`${bridge.url}/health`);
    assert.equal(response.ok, true);
    assert.deepEqual(await response.json(), { ok: true });
  });
});

test('文档 API 在嵌入模式下可用', async () => {
  await withBridge({}, async (bridge) => {
    const created = await fetch(`${bridge.url}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { fileName: 'note.md', content: '# hi' } })
    });
    assert.equal(created.ok, true);
    const { documentId } = await created.json();
    assert.ok(documentId);
    const listed = await fetch(`${bridge.url}/api/documents`);
    const { documents } = await listed.json();
    assert.equal(documents.length, 1);
    assert.equal(documents[0].fileName, 'note.md');
  });
});

test('带回复的批注在文档摘要里生成「摘录回答」子节点', async () => {
  await withBridge({}, async (bridge) => {
    const created = await fetch(`${bridge.url}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: { fileName: 'note.md', content: '# hi' },
        annotations: [
          { id: 'a1', type: 'idea', quote: '原文', note: '如何衡量效率？', reply: '从另一本书里找到的答案', replyAt: 1753600000000 },
          { id: 'a2', type: 'idea', quote: '原文', note: '没有回复的想法' },
          { id: 'a3', type: 'marker', quote: '划线', reply: '   ' }
        ]
      })
    });
    assert.equal(created.ok, true);

    const { documents } = await (await fetch(`${bridge.url}/api/documents`)).json();
    assert.equal(documents.length, 1);
    const children = documents[0].answerDocuments;
    assert.equal(children.length, 1);
    assert.equal(children[0].requestId, 'a1');
    assert.equal(children[0].question, '如何衡量效率？');
    assert.equal(children[0].kind, 'reply');
    assert.equal(children[0].updatedAt, new Date(1753600000000).toISOString());
  });
});

test('嵌套追问：子文档里的批注回复携带 parentRequestId', async () => {
  await withBridge({}, async (bridge) => {
    await fetch(`${bridge.url}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: { fileName: 'note.md', content: '# hi' },
        annotations: [
          { id: 'a1', type: 'idea', quote: '原文', note: '一级问题', reply: '一级答案', ts: 1 },
          { id: 'a2', type: 'idea', quote: '一级答案里的句子', note: '二级追问', reply: '二级答案', answerRequestId: 'a1', ts: 2 }
        ]
      })
    });

    const { documents } = await (await fetch(`${bridge.url}/api/documents`)).json();
    const children = documents[0].answerDocuments;
    assert.equal(children.length, 2);
    const first = children.find((item: { requestId: string }) => item.requestId === 'a1');
    const second = children.find((item: { requestId: string }) => item.requestId === 'a2');
    assert.equal(first.parentRequestId, undefined);
    assert.equal(second.parentRequestId, 'a1');
  });
});

test('DELETE /api/documents/:id 删除文档', async () => {
  await withBridge({}, async (bridge) => {
    const created = await fetch(`${bridge.url}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { fileName: 'note.md', content: '# hi' } })
    });
    const { documentId } = await created.json();

    const deleted = await fetch(`${bridge.url}/api/documents/${documentId}`, { method: 'DELETE' });
    assert.equal(deleted.ok, true);
    assert.deepEqual(await deleted.json(), { ok: true });

    const { documents } = await (await fetch(`${bridge.url}/api/documents`)).json();
    assert.equal(documents.length, 0);
  });
});

test('/api/settings 读写 Gemini 配置且不回明文 Key', async () => {
  await withBridge({}, async (bridge) => {
    const initial = await (await fetch(`${bridge.url}/api/settings`)).json();
    assert.deepEqual(initial.gemini, { configured: false, apiKeyTail: '', model: 'gemini-2.5-flash', proxy: '' });

    const saved = await fetch(`${bridge.url}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini: { apiKey: 'AIzaSyTest123456', model: 'gemini-2.5-pro', proxy: 'http://127.0.0.1:7890' } })
    });
    assert.equal(saved.ok, true);
    const masked = await saved.json();
    assert.deepEqual(masked.gemini, {
      configured: true, apiKeyTail: '3456', model: 'gemini-2.5-pro', proxy: 'http://127.0.0.1:7890'
    });
    assert.ok(!JSON.stringify(masked).includes('AIzaSyTest'));

    const reloaded = await (await fetch(`${bridge.url}/api/settings`)).json();
    assert.equal(reloaded.gemini.configured, true);
  });
});

test('/api/translate 未配置 Key 时返回错误事件', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello world' })
    });
    const stream = await response.text();
    assert.match(stream, /event: error/);
    assert.match(stream, /Gemini API Key/);
  });
});

test('/api/translate 配置 Key 后流式返回译文', async () => {
  const { createServer } = await import('node:http');
  const prompts: string[] = [];
  const mock = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      prompts.push(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '你好' }] } }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '世界' }] } }] }) + '\n\n');
      res.end();
    });
  });
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const mockPort = (mock.address() as { port: number }).port;
  const previousBase = process.env.AGENT_BRIDGE_GEMINI_BASE;
  process.env.AGENT_BRIDGE_GEMINI_BASE = `http://127.0.0.1:${mockPort}`;
  try {
    await withBridge({}, async (bridge) => {
      await fetch(`${bridge.url}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini: { apiKey: 'test-key' } })
      });

      const response = await fetch(`${bridge.url}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello world' })
      });
      const stream = await response.text();
      assert.match(stream, /event: delta/);
      assert.match(stream, /你好/);
      assert.match(stream, /世界/);
      assert.equal(prompts.length, 1);
      assert.match(prompts[0], /hello world/);
    });
  } finally {
    if (previousBase === undefined) delete process.env.AGENT_BRIDGE_GEMINI_BASE;
    else process.env.AGENT_BRIDGE_GEMINI_BASE = previousBase;
    await new Promise((resolve) => mock.close(resolve));
  }
});

test('/api/settings/test 未配置且未提供 Key 时返回失败', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/api/settings/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.match(result.message, /Gemini API Key/);
  });
});

test('/api/settings/test 优先用请求里的 Key 试连，成功返回 ok', async () => {
  const { createServer } = await import('node:http');
  const keys: string[] = [];
  const mock = createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      keys.push(String(req.headers['x-goog-api-key'] || ''));
      if (keys[keys.length - 1] === 'good-key') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) + '\n\n');
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'API key not valid' } }));
      }
    });
  });
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const previousBase = process.env.AGENT_BRIDGE_GEMINI_BASE;
  process.env.AGENT_BRIDGE_GEMINI_BASE = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;
  try {
    await withBridge({}, async (bridge) => {
      // 保存了一个坏 Key，但请求里带好 Key：应测试请求里的（保存前先验证的场景）
      await fetch(`${bridge.url}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini: { apiKey: 'bad-key' } })
      });

      const good = await (await fetch(`${bridge.url}/api/settings/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini: { apiKey: 'good-key' } })
      })).json();
      assert.equal(good.ok, true);
      assert.equal(good.model, 'gemini-2.5-flash');
      assert.equal(keys[keys.length - 1], 'good-key');

      // 请求不带 Key：回落到已保存的坏 Key，失败并透出接口错误
      const savedTest = await (await fetch(`${bridge.url}/api/settings/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })).json();
      assert.equal(savedTest.ok, false);
      assert.match(savedTest.message, /API key not valid/);
      assert.equal(keys[keys.length - 1], 'bad-key');
    });
  } finally {
    if (previousBase === undefined) delete process.env.AGENT_BRIDGE_GEMINI_BASE;
    else process.env.AGENT_BRIDGE_GEMINI_BASE = previousBase;
    await new Promise((resolve) => mock.close(resolve));
  }
});

test('/api/chat 选 gemini 但未配置 Key 时返回错误事件', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'gemini',
        question: '这段讲什么？',
        document: { fileName: 'note.md', content: '# hi' },
        selection: { quote: 'hi' }
      })
    });
    const stream = await response.text();
    assert.match(stream, /event: error/);
    assert.match(stream, /Gemini API Key/);
  });
});

test('默认发送 CORS 头，cors:false 时不发送', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/health`);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  });
  await withBridge({ cors: false }, async (bridge) => {
    const response = await fetch(`${bridge.url}/health`);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});

test('staticDir 提供前端静态文件且根路径回落到 index.html', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'bridge-static-'));
  await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>墨笺</title>');
  await mkdir(join(staticDir, 'assets'));
  await writeFile(join(staticDir, 'assets', 'app.js'), 'console.log(1)');
  try {
    await withBridge({ staticDir }, async (bridge) => {
      const home = await fetch(`${bridge.url}/`);
      assert.equal(home.status, 200);
      assert.match(home.headers.get('content-type') || '', /text\/html/);
      assert.match(await home.text(), /墨笺/);

      const script = await fetch(`${bridge.url}/assets/app.js`);
      assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type') || '', /javascript/);

      const missing = await fetch(`${bridge.url}/assets/nope.js`);
      assert.equal(missing.status, 404);
    });
  } finally {
    await rm(staticDir, { recursive: true, force: true });
  }
});

test('staticDir 拒绝路径穿越', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'bridge-escape-'));
  const staticDir = join(parent, 'public');
  await mkdir(staticDir);
  await writeFile(join(staticDir, 'index.html'), 'ok');
  await writeFile(join(parent, 'secret.txt'), 'secret');
  try {
    await withBridge({ staticDir }, async (bridge) => {
      const escaped = await fetch(`${bridge.url}/..%2Fsecret.txt`);
      assert.equal(escaped.status, 404);
    });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('未配置 staticDir 时非 API 路径返回 404', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/index.html`);
    assert.equal(response.status, 404);
  });
});
