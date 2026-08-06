import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

test('/api/connectors 返回飞书与钉钉本机能力状态', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/api/connectors`);
    const result = await response.json();
    assert.equal(response.status, 200);
    for (const target of ['feishu', 'dingtalk']) {
      assert.equal(typeof result[target].available, 'boolean');
      assert.equal(typeof result[target].reason, 'string');
    }
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

// ===== Agent 模式：工程上下文 + 会话续接 =====

// 假 claude：把每次调用的 argv 与 cwd 追加到日志，提示词从 stdin 读。
const FAKE_AGENT_CLAUDE = `
  const fs = require('node:fs');
  let prompt = '';
  process.stdin.on('data', (chunk) => { prompt += chunk; });
  process.stdin.on('end', () => {
    fs.appendFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify({
      argv: process.argv.slice(2), cwd: process.cwd(), prompt
    }) + '\\n');
    if (process.argv.includes('--resume') && process.env.FAKE_AGENT_RESUME_FAILS) {
      process.stderr.write('No conversation found with session ID');
      process.exit(1);
    }
    process.stdout.write('已经帮你存好了');
  });
`;

async function withFakeAgentCli(script, extraEnv, run) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-chat-test-'));
  const fake = join(dir, 'fake-claude.js');
  const log = join(dir, 'calls.jsonl');
  await writeFile(fake, script);
  const keys = ['AGENT_BRIDGE_CLAUDE_COMMAND', 'AGENT_BRIDGE_CLAUDE_ARGS', 'FAKE_AGENT_LOG', ...Object.keys(extraEnv)];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.AGENT_BRIDGE_CLAUDE_COMMAND = process.execPath;
  process.env.AGENT_BRIDGE_CLAUDE_ARGS = fake;
  process.env.FAKE_AGENT_LOG = log;
  Object.assign(process.env, extraEnv);
  const readCalls = async () =>
    (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  try {
    await run({ dir, readCalls });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

async function askAgent(bridge, body) {
  const response = await fetch(`${bridge.url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: 'claude', mode: 'agent', ...body })
  });
  return response.text();
}

test('/api/chat Agent 模式：cwd 落在文档所属工程根，会话 id 持久化后续接', async () => {
  await withFakeAgentCli(FAKE_AGENT_CLAUDE, {}, async ({ dir, readCalls }) => {
    // 造一个带 .git 的工程，文档在其子目录里。
    await mkdir(join(dir, 'repo', '.git'), { recursive: true });
    await mkdir(join(dir, 'repo', 'docs'), { recursive: true });
    const localPath = join(dir, 'repo', 'docs', '技术方案.md');
    await writeFile(localPath, '# 方案');

    await withBridge({}, async (bridge) => {
      const document = { fileName: '技术方案.md', content: '# 方案\n正文', localPath };

      const first = await askAgent(bridge, {
        question: '把这篇存到飞书', document, selection: { quote: '方案' }
      });
      assert.match(first, /event: meta/);
      assert.match(first, /"mode":"agent"/);
      assert.match(first, /已经帮你存好了/);

      const calls = await readCalls();
      assert.equal(calls.length, 1);
      assert.ok(calls[0].cwd.endsWith(join('repo')), `cwd 应为工程根，实际 ${calls[0].cwd}`);
      assert.ok(calls[0].argv.includes('--session-id'), '首轮应新建会话');
      assert.ok(calls[0].argv.includes('--allowedTools'));
      assert.match(calls[0].prompt, /把这篇存到飞书/, '提示词应走 stdin');
      const sessionId = calls[0].argv[calls[0].argv.indexOf('--session-id') + 1];

      // 第二轮：同一篇文档应当续接上面那个会话。
      const second = await askAgent(bridge, {
        question: '再存一份到钉钉', document, selection: { quote: '方案' }
      });
      assert.match(second, /"resumed":true/);
      const after = await readCalls();
      assert.equal(after.length, 2);
      assert.ok(after[1].argv.includes('--resume'));
      assert.equal(after[1].argv[after[1].argv.indexOf('--resume') + 1], sessionId);
    });
  });
});

test('/api/chat Agent 模式：会话失效时自动重建并通知前端', async () => {
  await withFakeAgentCli(FAKE_AGENT_CLAUDE, { FAKE_AGENT_RESUME_FAILS: '1' }, async ({ readCalls }) => {
    await withBridge({}, async (bridge) => {
      const document = { fileName: 'note.md', content: '# hi' };
      await askAgent(bridge, { question: '第一问', document, selection: { quote: 'hi' } });
      const second = await askAgent(bridge, { question: '第二问', document, selection: { quote: 'hi' } });

      assert.match(second, /event: session-reset/);
      assert.match(second, /已经帮你存好了/, '重建会话后仍应给出回答');
      const calls = await readCalls();
      assert.equal(calls.length, 3, '首轮 + 失败的 resume + 重建后的新会话');
      assert.ok(calls[1].argv.includes('--resume'));
      assert.ok(calls[2].argv.includes('--session-id'));
    });
  });
});

test('/api/chat 问答模式不带工具、不带工作目录（默认零回归）', async () => {
  await withFakeAgentCli(`
    const fs = require('node:fs');
    fs.appendFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }) + '\\n');
    process.stdout.write('普通回答');
  `, {}, async ({ dir, readCalls }) => {
    await mkdir(join(dir, 'repo', '.git'), { recursive: true });
    const localPath = join(dir, 'repo', 'note.md');
    await writeFile(localPath, '# hi');

    await withBridge({}, async (bridge) => {
      const response = await fetch(`${bridge.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'claude', question: '这段讲什么',
          document: { fileName: 'note.md', content: '# hi', localPath },
          selection: { quote: 'hi' }
        })
      });
      // meta 事件在引擎启动前就写出，必须读完整个流才能确认子进程已跑完。
      await response.text();
      const calls = await readCalls();
      assert.ok(!calls[0].argv.includes('--allowedTools'));
      assert.ok(!calls[0].argv.includes('--session-id'));
      assert.ok(!calls[0].cwd.endsWith('repo'), '问答模式不切工作目录');
    });
  });
});

// ===== 连接器：一键发布到飞书 / 钉钉 =====

test('/api/publish 把当前文档发到飞书并把链接写回文档记录', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'publish-test-'));
  const fake = join(dir, 'fake-lark.js');
  await writeFile(fake, `
    const fs = require('node:fs');
    const at = process.argv.indexOf('--file');
    fs.writeFileSync(process.env.FAKE_LARK_BODY, fs.readFileSync(process.argv[at + 1], 'utf8'));
    process.stdout.write(JSON.stringify({ ok: true, data: { files: [{ url: 'https://x.feishu.cn/docx/abc' }] } }));
  `);
  const bodyFile = join(dir, 'body.md');
  const previous = {
    AGENT_BRIDGE_LARK_COMMAND: process.env.AGENT_BRIDGE_LARK_COMMAND,
    AGENT_BRIDGE_LARK_ARGS: process.env.AGENT_BRIDGE_LARK_ARGS,
    FAKE_LARK_BODY: process.env.FAKE_LARK_BODY
  };
  process.env.AGENT_BRIDGE_LARK_COMMAND = process.execPath;
  process.env.AGENT_BRIDGE_LARK_ARGS = fake;
  process.env.FAKE_LARK_BODY = bodyFile;
  try {
    await withBridge({}, async (bridge) => {
      const created = await fetch(`${bridge.url}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: { fileName: '技术方案.md', content: '# 方案\n正文' } })
      });
      const { documentId } = await created.json();

      const response = await fetch(`${bridge.url}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'feishu', documentId })
      });
      assert.equal(response.ok, true);
      const result = await response.json();
      assert.equal(result.url, 'https://x.feishu.cn/docx/abc');
      assert.equal(result.target, 'feishu');

      assert.equal(await readFile(bodyFile, 'utf8'), '# 方案\n正文', '发布内容应为文档正文');

      const detail = await (await fetch(`${bridge.url}/api/documents/${documentId}`)).json();
      const publications = detail.document.publications;
      assert.equal(publications.length, 1);
      assert.equal(publications[0].target, 'feishu');
      assert.equal(publications[0].url, 'https://x.feishu.cn/docx/abc');
      assert.ok(publications[0].at, '记录发布时间');
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('/api/publish 目标不支持或文档缺失时返回明确错误', async () => {
  await withBridge({}, async (bridge) => {
    const badTarget = await fetch(`${bridge.url}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'notion', document: { fileName: 'a.md', content: '#' } })
    });
    assert.equal(badTarget.status, 500);
    assert.match((await badTarget.json()).error, /不支持/);

    const missing = await fetch(`${bridge.url}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'feishu', documentId: 'nope' })
    });
    assert.equal(missing.status, 500);
  });
});

test('/api/publish 空文档不发布，避免在云端建一堆空壳', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'feishu', document: { fileName: 'a.md', content: '   ' } })
    });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /没有内容/);
  });
});

test('/api/compose 按选中路径生成长文并存为新文档', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'compose-test-'));
  const fake = join(dir, 'fake-claude.js');
  const promptFile = join(dir, 'prompt.txt');
  // 假 claude：把收到的提示词落盘供断言，stdout 输出固定文章。
  await writeFile(fake, `
    require('node:fs').writeFileSync(process.env.FAKE_CLAUDE_PROMPT_FILE, process.argv[2] || '');
    process.stdout.write('# 生成的长文\\n\\n这是按路径写出的正文。');
  `);
  const previousEnv = {
    AGENT_BRIDGE_CLAUDE_COMMAND: process.env.AGENT_BRIDGE_CLAUDE_COMMAND,
    AGENT_BRIDGE_CLAUDE_ARGS: process.env.AGENT_BRIDGE_CLAUDE_ARGS,
    FAKE_CLAUDE_PROMPT_FILE: process.env.FAKE_CLAUDE_PROMPT_FILE
  };
  process.env.AGENT_BRIDGE_CLAUDE_COMMAND = process.execPath;
  process.env.AGENT_BRIDGE_CLAUDE_ARGS = fake;
  process.env.FAKE_CLAUDE_PROMPT_FILE = promptFile;
  try {
    await withBridge({}, async (bridge) => {
      const created = await fetch(`${bridge.url}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: { fileName: 'note.md', content: '# 原文\n\n财富是资产。' },
          annotations: [
            { id: 'a1', type: 'idea', quote: '财富', note: '财富怎么定义', reply: '资产而非现金' },
            { id: 'a2', type: 'idea', quote: '资产', note: '如何追求财富', reply: '构建可复利的东西', answerRequestId: 'a1' }
          ]
        })
      });
      const { documentId } = await created.json();

      const response = await fetch(`${bridge.url}/api/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, requestIds: ['a2', 'a1'], mode: 'article', engine: 'claude' })
      });
      const stream = await response.text();
      assert.match(stream, /event: meta/);
      assert.match(stream, /"nodeCount":2/);
      assert.match(stream, /event: delta/);
      assert.match(stream, /生成的长文/);
      assert.match(stream, /event: done/);
      assert.match(stream, /"composedDocumentId"/);

      const prompt = await readFile(promptFile, 'utf8');
      assert.match(prompt, /财富是资产/, '原文进入提示词');
      assert.match(prompt, /财富怎么定义/);
      assert.match(prompt, /构建可复利的东西/);

      const { documents } = await (await fetch(`${bridge.url}/api/documents`)).json();
      assert.equal(documents.length, 2, '生成结果存为新文档');
      const composed = documents.find((doc: { fileName: string }) => /路径长文/.test(doc.fileName));
      assert.ok(composed, '新文档名带「路径长文」标签');
      const detail = await (await fetch(`${bridge.url}/api/documents/${composed.documentId}`)).json();
      assert.match(detail.document.content, /^# 生成的长文/);
      assert.match(detail.document.content, /由「阅读脉络 · 路径长文」生成/);
      assert.match(detail.document.content, /这是按路径写出的正文/);
    });
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('/api/compose 文档不存在或没有可用节点时返回错误事件', async () => {
  await withBridge({}, async (bridge) => {
    const missing = await fetch(`${bridge.url}/api/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'nope', requestIds: ['a1'] })
    });
    assert.match(await missing.text(), /event: error/);

    const created = await fetch(`${bridge.url}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { fileName: 'note.md', content: '# hi' } })
    });
    const { documentId } = await created.json();
    const empty = await fetch(`${bridge.url}/api/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, requestIds: ['ghost'] })
    });
    const stream = await empty.text();
    assert.match(stream, /event: error/);
    assert.match(stream, /节点/);
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
