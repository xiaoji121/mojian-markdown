// AI 问答引擎：本地 CLI 的调用抽象。
//   claude —— `claude -p <prompt>`，stdout 即回答，天然流式。
//   codex  —— `codex exec`，stdout 是进度噪音（thinking、token 统计等），
//              干净的最终回答通过 --output-last-message 落盘后一次性取回；
//              提示词经 stdin 传入，避免长文档超出 argv 长度限制。
// 均可用环境变量覆盖命令与参数（AGENT_BRIDGE_{CLAUDE,CODEX}_{COMMAND,ARGS}）。
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function normalizeEngine(value) {
  return value === 'codex' ? 'codex' : 'claude';
}

export function engineInvocation(engine, prompt, { env = process.env, outputFile = '' } = {}) {
  if (engine === 'codex') {
    const command = env.AGENT_BRIDGE_CODEX_COMMAND || 'codex';
    const base = env.AGENT_BRIDGE_CODEX_ARGS
      ? env.AGENT_BRIDGE_CODEX_ARGS.split(' ').filter(Boolean)
      : ['exec', '--skip-git-repo-check', '--color', 'never', '--sandbox', 'read-only', '--ephemeral'];
    const args = [...base];
    if (outputFile) args.push('--output-last-message', outputFile);
    args.push('-');
    return { command, args, stdinPrompt: prompt };
  }
  const command = env.AGENT_BRIDGE_CLAUDE_COMMAND || 'claude';
  const args = env.AGENT_BRIDGE_CLAUDE_ARGS
    ? [...env.AGENT_BRIDGE_CLAUDE_ARGS.split(' ').filter(Boolean), prompt]
    : ['-p', prompt];
  return { command, args, stdinPrompt: null };
}

function missingCliMessage(engine) {
  return engine === 'codex'
    ? '未找到 Codex CLI。请先安装并登录 codex，或设置 AGENT_BRIDGE_CODEX_COMMAND。'
    : '未找到 Claude CLI。请先安装并登录 Claude Code，或设置 AGENT_BRIDGE_CLAUDE_COMMAND。';
}

function spawnEngine(engine, invocation, onStdout) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: [invocation.stdinPrompt === null ? 'ignore' : 'pipe', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stdout.on('data', (chunk) => onStdout(chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      reject(error.code === 'ENOENT' ? new Error(missingCliMessage(engine)) : error);
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${invocation.command} exited with code ${code}`));
    });
    if (invocation.stdinPrompt !== null) {
      child.stdin.on('error', () => {});
      child.stdin.end(invocation.stdinPrompt);
    }
  });
}

async function runClaude(prompt, onDelta, env) {
  let answer = '';
  await spawnEngine('claude', engineInvocation('claude', prompt, { env }), (delta) => {
    answer += delta;
    onDelta(delta);
  });
  return answer.trim();
}

async function runCodex(prompt, onDelta, env) {
  const dir = await mkdtemp(join(tmpdir(), 'mojian-codex-'));
  const outputFile = join(dir, 'answer.md');
  try {
    // stdout 是人类可读进度，不进入回答；只取 --output-last-message 的最终消息。
    await spawnEngine('codex', engineInvocation('codex', prompt, { env, outputFile }), () => {});
    const answer = (await readFile(outputFile, 'utf8')).trim();
    if (!answer) throw new Error('Codex 没有返回回答内容');
    onDelta(answer);
    return answer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function runEngine(engine, prompt, onDelta, env = process.env) {
  return engine === 'codex' ? runCodex(prompt, onDelta, env) : runClaude(prompt, onDelta, env);
}
