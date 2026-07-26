import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engineInvocation, normalizeEngine, runEngine } from '../../scripts/agent-bridge-engines.js';

test('normalizeEngine 只认 codex，其余回退 claude', () => {
  assert.equal(normalizeEngine('codex'), 'codex');
  assert.equal(normalizeEngine('claude'), 'claude');
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
