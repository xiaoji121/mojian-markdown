import { allowOnlyLoopbackConnections } from '../helpers/loopbackNetwork.ts';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs, { access } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createServer } from 'node:http';
import { Socket } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { runEngine } from '../../scripts/agent-bridge-engines.js';
import { createEngineCli } from '../helpers/engineCli.ts';
import { createMockCli } from '../helpers/mockCli.ts';

allowOnlyLoopbackConnections();

test('mock engine tests block non-loopback network connections before connecting', () => {
  const socket = new Socket();
  try {
    assert.throws(() => socket.connect({ host: 'example.invalid', port: 80 }), /blocked non-loopback/);
  } finally {
    socket.destroy();
  }
});

const hostileText = '中文 空格 "quoted" \'single\' & echo INJECTED | more < in > out ^ %PATH% !VAR! $(echo bad) `echo bad`\nnext line';

for (const engine of ['claude', 'codex'] as const) {
  for (const discovery of ['PATH', 'explicit'] as const) {
    test(`${engine} ${discovery}: npm CLI in a Chinese/space path keeps argv, stdin and env literal`, async (t) => {
      const cli = await createEngineCli(t, engine);
      if (discovery === 'explicit') cli.env[`AGENT_BRIDGE_${engine.toUpperCase()}_COMMAND`] = cli.command;
      const deltas: string[] = [];
      const answer = await runEngine(engine, hostileText, (delta: string) => deltas.push(delta), cli.env);
      const record = JSON.parse(answer);
      assert.equal(record.marker, cli.env.MOCK_ENGINE_MARKER);
      assert.equal(deltas.join(''), answer);
      if (engine === 'claude') {
        assert.deepEqual(record.args, ['-p', hostileText]);
        assert.equal(record.stdin, '');
      } else {
        assert.equal(record.stdin, hostileText);
        assert.equal(record.args.at(-1), '-');
        assert.ok(!record.args.includes(hostileText));
        assert.ok(!answer.includes('[thinking]'));
        const output = record.args[record.args.indexOf('--output-last-message') + 1];
        await assert.rejects(access(dirname(output)), { code: 'ENOENT' });
      }
      await assert.rejects(access(join(cli.cwd, 'out')), { code: 'ENOENT' });
    });
  }

  test(`${engine} agent mode passes special-character paths and resume IDs as single arguments`, async (t) => {
    const cli = await createEngineCli(t, engine);
    cli.env[`AGENT_BRIDGE_${engine.toUpperCase()}_COMMAND`] = cli.command;
    const addDir = join(cli.cwd, '附录 & "literal" %PATH% !VAR!');
    const session = 'session "quoted" & echo INJECTED | more ^ %PATH% !VAR!';
    const answer = await runEngine(engine, hostileText, () => {}, cli.env, {
      mode: 'agent', cwd: cli.cwd, addDirs: [addDir],
      ...(engine === 'claude' ? { resumeSessionId: session } : {})
    });
    const record = JSON.parse(answer);
    assert.equal(record.cwd.toLowerCase(), cli.cwd.toLowerCase());
    assert.equal(record.stdin, hostileText);
    assert.equal(record.args[record.args.indexOf('--add-dir') + 1], addDir);
    if (engine === 'claude') assert.equal(record.args[record.args.indexOf('--resume') + 1], session);
    else assert.ok(record.args.includes('sandbox_workspace_write.network_access=true'));
  });

  test(`${engine} reports stderr and nonzero exit without returning a partial answer`, async (t) => {
    const cli = await createEngineCli(t, engine);
    cli.env.MOCK_ENGINE_BEHAVIOR = 'fail';
    await assert.rejects(runEngine(engine, '问题', () => {}, cli.env), /模拟 CLI failure/);
    const record = await cli.readRecord();
    if (engine === 'codex') {
      const output = record.args[record.args.indexOf('--output-last-message') + 1];
      await assert.rejects(access(dirname(output)), { code: 'ENOENT' });
    }
  });

  test(`${engine} missing command returns its actionable installation message`, async (t) => {
    const cli = await createEngineCli(t, engine);
    cli.env[`AGENT_BRIDGE_${engine.toUpperCase()}_COMMAND`] = join(cli.root, '不存在 missing CLI');
    await assert.rejects(runEngine(engine, '问题', () => {}, cli.env),
      engine === 'claude' ? /Claude CLI.*AGENT_BRIDGE_CLAUDE_COMMAND/ : /Codex CLI.*AGENT_BRIDGE_CODEX_COMMAND/);
  });

  test(`${engine} timeout terminates its child and cleans up final-output files`, async (t) => {
    const cli = await createEngineCli(t, engine);
    cli.env.MOCK_ENGINE_BEHAVIOR = 'hang';
    await assert.rejects(runEngine(engine, '问题', () => {}, cli.env, { timeoutMs: 250 }),
      { name: 'TimeoutError', code: 'ETIMEDOUT' });
    // A heavily loaded host can time out before Node reaches the fixture at all.
    const record = await cli.readRecord().catch(() => null);
    if (record) await assertStopped(record, engine);
  });

  test(`${engine} AbortSignal cancels a running child and cleans up final-output files`, async (t) => {
    const cli = await createEngineCli(t, engine);
    cli.env.MOCK_ENGINE_BEHAVIOR = 'hang';
    const controller = new AbortController();
    const abort = () => controller.abort();
    await assert.rejects(runEngine(engine, '问题', abort, cli.env, {
      mode: 'agent', signal: controller.signal, onProgress: abort
    }), { name: 'AbortError', code: 'ABORT_ERR' });
    await assertStopped(await cli.readRecord(), engine);
  });

  test(`${engine} pre-aborted request never launches a CLI`, async (t) => {
    const cli = await createEngineCli(t, engine);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(runEngine(engine, '问题', () => {}, cli.env, { signal: controller.signal }),
      { name: 'AbortError', code: 'ABORT_ERR' });
    await assert.rejects(access(cli.recordFile), { code: 'ENOENT' });
  });
}

for (const engine of ['claude', 'codex'] as const) {
  for (const cancellation of ['abort', 'timeout'] as const) {
    test(`${engine} ${cancellation} terminates an npm wrapper and its inherited-stdio child`, { timeout: 10000 }, async (t) => {
      const cli = await createEngineCli(t, engine);
      const survivor = join(cli.root, 'descendant-survived');
      const childCode = `
        const fs = require('node:fs');
        process.stdout.write(${JSON.stringify(engine === 'codex' ? '{"type":"turn.started"}\n' : 'ready\n')});
        setTimeout(() => fs.writeFileSync(${JSON.stringify(survivor)}, 'still running'), 2000);
        setTimeout(() => process.exit(0), 3000);
      `;
      await createMockCli(cli.bin, 'mojian-test-' + engine, `
        const fs = require('node:fs');
        const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], {
          stdio: ['ignore', 'inherit', 'inherit']
        });
        fs.writeFileSync(process.env.MOCK_ENGINE_RECORD, JSON.stringify({ pid: process.pid, childPid: child.pid }));
        process.stdin.resume();
      `);
      const controller = new AbortController();
      const abort = () => { if (cancellation === 'abort') controller.abort(); };
      await assert.rejects(runEngine(engine, '问题', abort, cli.env, {
        mode: 'agent', onProgress: abort,
        ...(cancellation === 'abort' ? { signal: controller.signal } : { timeoutMs: 500 })
      }), cancellation === 'abort'
        ? { name: 'AbortError', code: 'ABORT_ERR' }
        : { name: 'TimeoutError', code: 'ETIMEDOUT' });
      await assert.rejects(access(survivor), { code: 'ENOENT' });
      const record = await cli.readRecord().catch(() => null);
      if (record) {
        assert.throws(() => process.kill(record.pid, 0), { code: 'ESRCH' });
        // Unix may briefly retain an orphan as a zombie; signal 0 alone cannot distinguish it.
        if (process.platform === 'win32') assert.throws(() => process.kill(record.childPid, 0), { code: 'ESRCH' });
      }
    });
  }
}

test('failed CLI tree termination is reported instead of being hidden as an ordinary abort', {
  skip: process.platform === 'win32'
}, async (t) => {
  const cli = await createEngineCli(t, 'claude');
  cli.env.MOCK_ENGINE_BEHAVIOR = 'hang';
  const controller = new AbortController();
  const originalKill = process.kill;
  const patchedKill = t.mock.method(process, 'kill', (pid: number, signal) => {
    if (pid < 0) throw Object.assign(new Error('mock denied tree termination'), { code: 'EPERM' });
    return originalKill.call(process, pid, signal);
  });
  try {
    await assert.rejects(runEngine('claude', '问题', () => controller.abort(), cli.env, {
      signal: controller.signal
    }), { code: 'ECLI_TERMINATION_FAILED', message: /mock denied tree termination/ });
  } finally {
    patchedKill.mock.restore();
    const record = await cli.readRecord().catch(() => null);
    if (record) {
      try { originalKill.call(process, -record.pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
});

test('taskkill failure is preserved when the CLI root closes before taskkill finishes', async (t) => {
  const cli = await createEngineCli(t, 'claude');
  cli.env.MOCK_ENGINE_BEHAVIOR = 'hang';
  const controller = new AbortController();
  let readyResolve;
  const ready = new Promise<void>((resolve) => { readyResolve = resolve; });
  const pending = runEngine('claude', '问题', () => readyResolve(), cli.env, { signal: controller.signal });
  const expected = assert.rejects(pending, {
    code: 'ECLI_TERMINATION_FAILED', message: /mock partial taskkill failure/
  });
  await ready;
  const record = await cli.readRecord();
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const originalRoot = process.env.SystemRoot;
  const originalSpawn = childProcess.spawn;
  const originalKill = process.kill.bind(process);
  const patchedSpawn = t.mock.method(childProcess, 'spawn', (command, ...args) => {
    if (!String(command).endsWith('taskkill.exe')) return originalSpawn(command, ...args);
    const killer = new EventEmitter() as EventEmitter & { stderr: PassThrough; kill: () => boolean };
    killer.stderr = new PassThrough();
    killer.kill = () => true;
    // The root closes first, but taskkill later reports a descendant permission error.
    originalKill(platform.value === 'win32' ? record.pid : -record.pid, 'SIGKILL');
    setTimeout(() => {
      killer.stderr.write('mock partial taskkill failure');
      killer.emit('close', 1);
    }, 40);
    return killer;
  });
  syncBuiltinESMExports();
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  process.env.SystemRoot = 'C:\\Windows';
  try {
    controller.abort();
    await expected;
  } finally {
    patchedSpawn.mock.restore();
    syncBuiltinESMExports();
    Object.defineProperty(process, 'platform', platform);
    if (originalRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = originalRoot;
    try { originalKill(platform.value === 'win32' ? record.pid : -record.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
});

test('codex resume preserves quoted sandbox settings and hostile session IDs', async (t) => {
  const cli = await createEngineCli(t, 'codex');
  const session = 'thread "quoted" & echo INJECTED | more ^ %PATH% !VAR!';
  const answer = await runEngine('codex', hostileText, () => {}, cli.env, {
    mode: 'agent', cwd: cli.cwd, resumeSessionId: session
  });
  const record = JSON.parse(answer);
  assert.deepEqual(record.args.slice(0, 3), ['exec', 'resume', session]);
  assert.equal(record.args[record.args.indexOf('-c') + 1], 'sandbox_mode="workspace-write"');
  assert.equal(record.stdin, hostileText);
});

test('codex cancellation while reading the final file emits no answer delta', async (t) => {
  const cli = await createEngineCli(t, 'codex');
  const controller = new AbortController();
  const deltas: string[] = [];
  const originalReadFile = fs.readFile;
  let intercepted = false;
  const patchedReadFile = t.mock.method(fs, 'readFile', async (...args) => {
    const content = await originalReadFile(...args);
    if (String(args[0]).endsWith('answer.md')) {
      intercepted = true;
      controller.abort();
    }
    return content;
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(runEngine('codex', '问题', (delta: string) => deltas.push(delta), cli.env, {
      signal: controller.signal
    }), { name: 'AbortError', code: 'ABORT_ERR' });
    assert.equal(intercepted, true);
    assert.deepEqual(deltas, []);
  } finally {
    patchedReadFile.mock.restore();
    syncBuiltinESMExports();
  }
});

async function assertStopped(record: { pid: number; args: string[] }, engine: string) {
  assert.throws(() => process.kill(record.pid, 0), { code: 'ESRCH' });
  if (engine === 'codex') {
    const output = record.args[record.args.indexOf('--output-last-message') + 1];
    await assert.rejects(access(dirname(output)), { code: 'ENOENT' });
  }
}

async function geminiServer(t: TestContext, handler: (req: IncomingMessage, res: ServerResponse, body: string) => void) {
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => handler(req, res, body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return { AGENT_BRIDGE_GEMINI_BASE: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}

function sse(text: string, end = '\r\n\r\n') {
  return 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) + end;
}

const gemini = { apiKey: 'local-test-only', model: 'gemini-mock' };

test('Gemini uses its HTTP API, preserves the prompt and reads split UTF-8 SSE packets', async (t) => {
  let observed: { url?: string; key?: string | string[]; body?: string } = {};
  const env = await geminiServer(t, (req, res, body) => {
    observed = { url: req.url, key: req.headers['x-goog-api-key'], body };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const first = Buffer.from(sse('中文'));
    const split = first.indexOf(Buffer.from('中文')) + 1;
    res.write(first.subarray(0, split));
    setImmediate(() => res.end(Buffer.concat([first.subarray(split), Buffer.from(sse('回答', ''))])));
  });
  const deltas: string[] = [];
  const answer = await runEngine('gemini', hostileText, (delta: string) => deltas.push(delta), env, { gemini });
  assert.equal(answer, '中文回答');
  assert.deepEqual(deltas, ['中文', '回答']);
  assert.equal(observed.url, '/v1beta/models/gemini-mock:streamGenerateContent?alt=sse');
  assert.equal(observed.key, gemini.apiKey);
  assert.equal(JSON.parse(observed.body!).contents[0].parts[0].text, hostileText);
});

test('Gemini reports HTTP errors from a loopback mock without needing an account', async (t) => {
  const env = await geminiServer(t, (_req, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'mock quota exceeded' } }));
  });
  await assert.rejects(runEngine('gemini', '问题', () => {}, env, { gemini }), /Gemini：mock quota exceeded/);
});

test('Gemini timeout aborts an HTTP request before response headers arrive', async (t) => {
  const env = await geminiServer(t, (_req, res) => {
    const fallback = setTimeout(() => res.end(sse('late')), 900);
    res.on('close', () => clearTimeout(fallback));
  });
  await assert.rejects(runEngine('gemini', '问题', () => {}, env, { gemini, timeoutMs: 100 }),
    { name: 'TimeoutError', code: 'ETIMEDOUT' });
});

test('Gemini AbortSignal stops a response while it is streaming', async (t) => {
  const env = await geminiServer(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(sse('first'));
    const fallback = setTimeout(() => res.end(sse('late')), 900);
    res.on('close', () => clearTimeout(fallback));
  });
  const controller = new AbortController();
  const deltas: string[] = [];
  await assert.rejects(runEngine('gemini', '问题', (delta: string) => {
    deltas.push(delta);
    controller.abort();
  }, env, { gemini, signal: controller.signal }), { name: 'AbortError', code: 'ABORT_ERR' });
  assert.deepEqual(deltas, ['first']);
});

test('Gemini pre-aborted request sends nothing to its HTTP endpoint', async (t) => {
  let requests = 0;
  const env = await geminiServer(t, (_req, res) => { requests += 1; res.end(sse('unexpected')); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runEngine('gemini', '问题', () => {}, env, { gemini, signal: controller.signal }),
    { name: 'AbortError', code: 'ABORT_ERR' });
  assert.equal(requests, 0);
});
