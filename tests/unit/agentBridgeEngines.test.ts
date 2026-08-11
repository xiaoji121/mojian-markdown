import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engineInvocation, normalizeEngine, runEngine } from '../../scripts/agent-bridge-engines.js';

test('normalizeEngine 认本地与 API Agent，其余回退 claude', () => {
  assert.equal(normalizeEngine('codex'), 'codex');
  assert.equal(normalizeEngine('claude'), 'claude');
  assert.equal(normalizeEngine('gemini'), 'gemini');
  assert.equal(normalizeEngine('kimi'), 'kimi');
  assert.equal(normalizeEngine('qwen'), 'qwen');
  assert.equal(normalizeEngine('custom'), 'custom');
  assert.equal(normalizeEngine('gpt'), 'claude');
  assert.equal(normalizeEngine(undefined), 'claude');
});

test('claude 引擎默认命令为 claude -p <prompt>', () => {
  const invocation = engineInvocation('claude', '问题', { env: {} });

  assert.equal(invocation.command, 'claude');
  assert.deepEqual(invocation.args, ['-p', '问题']);
  assert.equal(invocation.stdinPrompt, null);
});

test('claude 引擎可用环境变量覆盖命令与参数', () => {
  const invocation = engineInvocation('claude', '问题', {
    env: { AGENT_BRIDGE_CLAUDE_COMMAND: 'my-claude', AGENT_BRIDGE_CLAUDE_ARGS: '-p --model opus' }
  });

  assert.equal(invocation.command, 'my-claude');
  assert.deepEqual(invocation.args, ['-p', '--model', 'opus', '问题']);
});

test('codex 引擎经 stdin 传提示词，回答写入 --output-last-message 文件', () => {
  const invocation = engineInvocation('codex', '问题', { env: {}, outputFile: '/tmp/answer.txt' });

  assert.equal(invocation.command, 'codex');
  assert.equal(invocation.args[0], 'exec');
  assert.ok(invocation.args.includes('--skip-git-repo-check'));
  const flagAt = invocation.args.indexOf('--output-last-message');
  assert.equal(invocation.args[flagAt + 1], '/tmp/answer.txt');
  assert.equal(invocation.args[invocation.args.length - 1], '-');
  assert.equal(invocation.stdinPrompt, '问题');
});

test('codex 引擎可用环境变量覆盖命令与参数，输出文件仍由桥接接管', () => {
  const invocation = engineInvocation('codex', '问题', {
    env: { AGENT_BRIDGE_CODEX_COMMAND: 'my-codex', AGENT_BRIDGE_CODEX_ARGS: 'exec --model gpt-5-codex' },
    outputFile: '/tmp/answer.txt'
  });

  assert.equal(invocation.command, 'my-codex');
  assert.deepEqual(invocation.args.slice(0, 3), ['exec', '--model', 'gpt-5-codex']);
  assert.ok(invocation.args.includes('--output-last-message'));
  assert.equal(invocation.args[invocation.args.length - 1], '-');
});

test('runEngine(codex) 只把最终回答作为答案，忽略进度输出', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engine-test-'));
  try {
    const fake = join(dir, 'fake-codex.js');
    // 假 codex：向 stdout 打印进度噪音，把最终回答写进 --output-last-message 指定的文件。
    await writeFile(fake, `
      const at = process.argv.indexOf('--output-last-message');
      const file = process.argv[at + 1];
      process.stdin.resume();
      process.stdin.on('end', () => {
        process.stdout.write('[thinking] noise...\\n');
        require('node:fs').writeFileSync(file, '模拟最终回答');
        process.exit(0);
      });
    `);
    const deltas: string[] = [];
    const answer = await runEngine('codex', '问题', (delta: string) => deltas.push(delta), {
      AGENT_BRIDGE_CODEX_COMMAND: process.execPath,
      AGENT_BRIDGE_CODEX_ARGS: fake
    });

    assert.equal(answer, '模拟最终回答');
    assert.deepEqual(deltas, ['模拟最终回答']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runEngine(claude) 保持流式输出并累积为答案', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engine-test-'));
  try {
    const fake = join(dir, 'fake-claude.js');
    await writeFile(fake, `
      process.stdout.write('流式');
      setTimeout(() => { process.stdout.write('回答'); process.exit(0); }, 20);
    `);
    const deltas: string[] = [];
    const answer = await runEngine('claude', '问题', (delta: string) => deltas.push(delta), {
      AGENT_BRIDGE_CLAUDE_COMMAND: process.execPath,
      AGENT_BRIDGE_CLAUDE_ARGS: fake
    });

    assert.equal(answer, '流式回答');
    assert.ok(deltas.length >= 1);
    assert.equal(deltas.join(''), '流式回答');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI 不存在时给出对应引擎的安装提示', async () => {
  await assert.rejects(
    () => runEngine('codex', '问题', () => {}, { AGENT_BRIDGE_CODEX_COMMAND: 'definitely-missing-codex-xyz' }),
    (error: Error) => error.message.includes('Codex CLI')
  );
  await assert.rejects(
    () => runEngine('claude', '问题', () => {}, { AGENT_BRIDGE_CLAUDE_COMMAND: 'definitely-missing-claude-xyz' }),
    (error: Error) => error.message.includes('Claude CLI')
  );
});

// ===== Agent 模式 =====
// 问答模式保持只会说话；Agent 模式解开三处限制：工具白名单、工作目录、会话续接。

test('claude Agent 模式：提示词走 stdin，带工具白名单，首轮用 --session-id', () => {
  const invocation = engineInvocation('claude', '把这篇存到飞书', {
    env: {},
    mode: 'agent',
    cwd: '/repo',
    sessionId: '11111111-2222-3333-4444-555555555555'
  });

  // --allowedTools 是可变参数，提示词若仍作为尾参会被吞掉，必须走 stdin。
  assert.equal(invocation.stdinPrompt, '把这篇存到飞书');
  assert.ok(!invocation.args.includes('把这篇存到飞书'));
  assert.equal(invocation.cwd, '/repo');
  const toolsAt = invocation.args.indexOf('--allowedTools');
  assert.ok(toolsAt > -1, '应传工具白名单');
  const tools = invocation.args[toolsAt + 1];
  assert.match(tools, /Bash\(lark-cli:\*\)/);
  assert.match(tools, /Bash\(dws:\*\)/);
  assert.match(tools, /Read/);
  assert.ok(!/Write/.test(tools), '默认不给写文件权限');
  const sessionAt = invocation.args.indexOf('--session-id');
  assert.equal(invocation.args[sessionAt + 1], '11111111-2222-3333-4444-555555555555');
  assert.ok(!invocation.args.includes('--resume'));
});

test('claude Agent 模式：已有会话时用 --resume 续接，不再传 --session-id', () => {
  const invocation = engineInvocation('claude', '接着聊', {
    env: {},
    mode: 'agent',
    cwd: '/repo',
    sessionId: 'new-id',
    resumeSessionId: 'old-id'
  });

  const resumeAt = invocation.args.indexOf('--resume');
  assert.equal(invocation.args[resumeAt + 1], 'old-id');
  assert.ok(!invocation.args.includes('--session-id'));
});

test('claude Agent 模式：允许写文件时白名单才加 Write/Edit', () => {
  const invocation = engineInvocation('claude', '生成一篇方案', {
    env: {}, mode: 'agent', cwd: '/repo', sessionId: 'x', allowWrite: true
  });

  const tools = invocation.args[invocation.args.indexOf('--allowedTools') + 1];
  assert.match(tools, /Write/);
  assert.match(tools, /Edit/);
});

test('claude Agent 模式：额外可读目录（工作区暂存文件）通过 --add-dir 授权', () => {
  const invocation = engineInvocation('claude', '发布', {
    env: {}, mode: 'agent', cwd: '/repo', sessionId: 'x', addDirs: ['/workspace/scratch']
  });

  const addAt = invocation.args.indexOf('--add-dir');
  assert.equal(invocation.args[addAt + 1], '/workspace/scratch');
});

test('codex Agent 模式：去掉 --ephemeral 才能留下可续接的会话，并开 --json', () => {
  const invocation = engineInvocation('codex', '把这篇存到钉钉', {
    env: {}, mode: 'agent', cwd: '/repo', outputFile: '/tmp/answer.md'
  });

  assert.deepEqual(invocation.args.slice(0, 2), ['exec', '--skip-git-repo-check']);
  assert.ok(!invocation.args.includes('--ephemeral'), '会话必须落盘才能 resume');
  assert.ok(invocation.args.includes('--json'), '需要 --json 才能拿到 thread_id');
  const sandboxAt = invocation.args.indexOf('--sandbox');
  assert.equal(invocation.args[sandboxAt + 1], 'workspace-write');
  assert.equal(invocation.cwd, '/repo');
  assert.equal(invocation.args[invocation.args.length - 1], '-');
});

test('codex Agent 模式续接：用 exec resume <id>，沙箱只能靠 -c 覆盖', () => {
  const invocation = engineInvocation('codex', '接着聊', {
    env: {}, mode: 'agent', cwd: '/repo', outputFile: '/tmp/answer.md', resumeSessionId: 'thread-1'
  });

  assert.deepEqual(invocation.args.slice(0, 3), ['exec', 'resume', 'thread-1']);
  // codex exec resume 不接受 -C/--cd 与 --sandbox，工作目录只能靠子进程 cwd。
  assert.ok(!invocation.args.includes('--sandbox'));
  assert.ok(!invocation.args.includes('-C'));
  assert.ok(invocation.args.some((arg: string) => arg.startsWith('sandbox_mode=')));
  assert.equal(invocation.cwd, '/repo');
});

test('runEngine(codex) Agent 模式从 --json 事件里捕获 thread_id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engine-test-'));
  try {
    const fake = join(dir, 'fake-codex.js');
    await writeFile(fake, `
      const at = process.argv.indexOf('--output-last-message');
      const file = process.argv[at + 1];
      process.stdin.resume();
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'thread-42' }) + '\\n');
        process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
        require('node:fs').writeFileSync(file, '已存入钉钉');
        process.exit(0);
      });
    `);
    const sessions: string[] = [];
    const answer = await runEngine('codex', '存到钉钉', () => {}, {
      AGENT_BRIDGE_CODEX_COMMAND: process.execPath,
      AGENT_BRIDGE_CODEX_ARGS: fake
    }, { mode: 'agent', onSession: (id: string) => sessions.push(id) });

    assert.equal(answer, '已存入钉钉');
    assert.deepEqual(sessions, ['thread-42']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runEngine(codex) Agent 模式把 JSON 事件转换为安全的执行进度，不暴露推理正文', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engine-test-'));
  try {
    const fake = join(dir, 'fake-codex.js');
    await writeFile(fake, `
      const at = process.argv.indexOf('--output-last-message');
      const file = process.argv[at + 1];
      process.stdin.resume();
      process.stdin.on('end', () => {
        const events = [
          { type: 'turn.started' },
          { type: 'item.completed', item: { type: 'reasoning', text: '绝不能展示的内部推理' } },
          { type: 'item.started', item: { type: 'command_execution', command: 'echo SUPER_SECRET' } },
          { type: 'item.completed', item: { type: 'file_change', changes: [{ path: 'draft.md' }] } },
          { type: 'turn.completed' }
        ];
        events.forEach((event) => process.stdout.write(JSON.stringify(event) + '\\n'));
        require('node:fs').writeFileSync(file, '完成');
        process.exit(0);
      });
    `);
    const progress: Array<{ label: string; state: string }> = [];
    await runEngine('codex', '生成文档', () => {}, {
      AGENT_BRIDGE_CODEX_COMMAND: process.execPath,
      AGENT_BRIDGE_CODEX_ARGS: fake
    }, { mode: 'agent', onProgress: (item) => progress.push(item) });

    assert.deepEqual(progress.map((item) => item.label), [
      '开始分析请求', '完成一步分析', '正在执行命令', '已更新文件 · draft.md', '正在整理回答'
    ]);
    assert.ok(progress.every((item) => !item.label.includes('SUPER_SECRET')));
    assert.ok(progress.every((item) => !item.label.includes('绝不能展示')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runEngine Agent 模式在指定工作目录里启动子进程', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engine-test-'));
  try {
    const fake = join(dir, 'fake-claude.js');
    await writeFile(fake, `process.stdout.write(process.cwd());`);
    const answer = await runEngine('claude', '你在哪', () => {}, {
      AGENT_BRIDGE_CLAUDE_COMMAND: process.execPath,
      AGENT_BRIDGE_CLAUDE_ARGS: fake
    }, { mode: 'agent', cwd: dir, sessionId: 'x' });

    // macOS tmpdir 经软链，比对结尾即可。
    assert.ok(answer.endsWith(dir.replace('/private', '')) || answer.endsWith(dir), `cwd 未生效：${answer}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runEngine(claude) Agent 模式把会话 id 回调出去，供桥接持久化', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engine-test-'));
  try {
    const fake = join(dir, 'fake-claude.js');
    await writeFile(fake, `process.stdout.write('好了');`);
    const sessions: string[] = [];
    await runEngine('claude', '问题', () => {}, {
      AGENT_BRIDGE_CLAUDE_COMMAND: process.execPath,
      AGENT_BRIDGE_CLAUDE_ARGS: fake
    }, { mode: 'agent', sessionId: 'session-9', onSession: (id: string) => sessions.push(id) });

    assert.deepEqual(sessions, ['session-9']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ===== Gemini（API Key 提供方） =====

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

async function withGeminiMock(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
  run: (baseUrl: string) => Promise<void>
) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => handler(req, res, body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function sseChunk(text: string) {
  return 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) + '\n\n';
}

test('runEngine(gemini) 流式解析 SSE 并累积为答案', async () => {
  const requests: Array<{ url: string; key: string; body: string }> = [];
  await withGeminiMock((req, res, body) => {
    requests.push({ url: req.url || '', key: String(req.headers['x-goog-api-key'] || ''), body });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(sseChunk('译'));
    res.write(sseChunk('文'));
    res.end();
  }, async (baseUrl) => {
    const deltas: string[] = [];
    const answer = await runEngine(
      'gemini', '翻译这个', (delta: string) => deltas.push(delta),
      { AGENT_BRIDGE_GEMINI_BASE: baseUrl },
      { gemini: { apiKey: 'test-key', model: 'gemini-2.5-flash' } }
    );

    assert.equal(answer, '译文');
    assert.deepEqual(deltas, ['译', '文']);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/v1beta\/models\/gemini-2\.5-flash:streamGenerateContent/);
    assert.equal(requests[0].key, 'test-key');
    assert.match(requests[0].body, /翻译这个/);
  });
});

test('runEngine(gemini) 未配置 Key 时给出配置提示', async () => {
  await assert.rejects(
    () => runEngine('gemini', '问题', () => {}, {}, {}),
    (error: Error) => error.message.includes('Gemini API Key')
  );
});

test('runEngine(gemini) 透出接口返回的错误信息', async () => {
  await withGeminiMock((_req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'API key not valid' } }));
  }, async (baseUrl) => {
    await assert.rejects(
      () => runEngine('gemini', '问题', () => {}, { AGENT_BRIDGE_GEMINI_BASE: baseUrl },
        { gemini: { apiKey: 'bad-key', model: 'gemini-2.5-flash' } }),
      (error: Error) => error.message.includes('API key not valid')
    );
  });
});

// ===== Gemini 代理支持 =====
// undici 的 ProxyAgent 通过 CONNECT 隧道转发；mock 代理响应 CONNECT 后
// 在隧道内直接代答 SSE，以此验证流量确实走了代理（上游地址故意不可达）。

async function withProxyMock(
  run: (proxyUrl: string, seen: string[]) => Promise<void>
) {
  const seen: string[] = [];
  const proxy = createServer(() => {});
  proxy.on('connect', (req, clientSocket) => {
    seen.push(req.url || '');
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    let replied = false;
    clientSocket.on('data', () => {
      if (replied) return;
      replied = true;
      const payload = sseChunk('经代理的译文');
      clientSocket.end(
        'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n' +
        'Content-Length: ' + Buffer.byteLength(payload) + '\r\n\r\n' + payload
      );
    });
    clientSocket.on('error', () => {});
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${address.port}`, seen);
  } finally {
    await new Promise((resolve) => proxy.close(resolve));
  }
}

test('runEngine(gemini) 配置代理地址后经代理访问接口', async () => {
  await withProxyMock(async (proxyUrl, seen) => {
    const answer = await runEngine('gemini', '问题', () => {},
      { AGENT_BRIDGE_GEMINI_BASE: 'http://127.0.0.1:59987' },
      { gemini: { apiKey: 'k', model: 'gemini-2.5-flash', proxy: proxyUrl } });

    assert.equal(answer, '经代理的译文');
    assert.equal(seen.length, 1);
    assert.equal(seen[0], '127.0.0.1:59987', '代理应收到指向上游的 CONNECT');
  });
});

test('runEngine(gemini) 未配置代理时回落到环境变量 HTTPS_PROXY', async () => {
  await withProxyMock(async (proxyUrl, seen) => {
    const answer = await runEngine('gemini', '问题', () => {},
      { AGENT_BRIDGE_GEMINI_BASE: 'http://127.0.0.1:59987', HTTPS_PROXY: proxyUrl },
      { gemini: { apiKey: 'k', model: 'gemini-2.5-flash' } });

    assert.equal(answer, '经代理的译文');
    assert.equal(seen.length, 1);
  });
});

// ===== Gemini SSE 解析健壮性 =====

test('runEngine(gemini) 兼容 CRLF 分隔的 SSE 流与无结尾分隔符的末包', async () => {
  await withGeminiMock((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    // 真实 Gemini 接口用 \r\n\r\n 分隔事件；最后一包后面没有分隔符
    res.write('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '译' }] } }] }) + '\r\n\r\n');
    res.write('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '文' }] } }] }) + '\r\n\r\n');
    res.end('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '完' }] } }] }));
  }, async (baseUrl) => {
    const deltas: string[] = [];
    const answer = await runEngine('gemini', '翻译', (delta: string) => deltas.push(delta),
      { AGENT_BRIDGE_GEMINI_BASE: baseUrl },
      { gemini: { apiKey: 'k', model: 'gemini-2.5-flash' } });

    assert.equal(answer, '译文完');
    assert.deepEqual(deltas, ['译', '文', '完']);
  });
});

test('runEngine(gemini) 忽略思考片段，只取正式回答', async () => {
  await withGeminiMock((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({
      candidates: [{ content: { parts: [{ thought: true, text: '思考中…' }] } }]
    }) + '\r\n\r\n');
    res.end('data: ' + JSON.stringify({
      candidates: [{ content: { parts: [{ text: '正式译文' }] } }]
    }) + '\r\n\r\n');
  }, async (baseUrl) => {
    const answer = await runEngine('gemini', '翻译', () => {},
      { AGENT_BRIDGE_GEMINI_BASE: baseUrl },
      { gemini: { apiKey: 'k', model: 'gemini-2.5-flash' } });

    assert.equal(answer, '正式译文');
  });
});

test('runEngine(gemini) 空回复时抛出带原因的错误', async () => {
  await withGeminiMock((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: ' + JSON.stringify({
      candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }]
    }) + '\r\n\r\n');
  }, async (baseUrl) => {
    await assert.rejects(
      () => runEngine('gemini', '翻译', () => {}, { AGENT_BRIDGE_GEMINI_BASE: baseUrl },
        { gemini: { apiKey: 'k', model: 'gemini-2.5-flash' } }),
      (error: Error) => error.message.includes('SAFETY')
    );
  });
});
