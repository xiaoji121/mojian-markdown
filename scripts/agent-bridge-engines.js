// AI 问答引擎：本地 CLI 与 API Key 提供方的调用抽象。
//   claude —— `claude -p <prompt>`，stdout 即回答，天然流式。
//   codex  —— `codex exec`，stdout 是进度噪音（thinking、token 统计等），
//              干净的最终回答通过 --output-last-message 落盘后一次性取回；
//              提示词经 stdin 传入，避免长文档超出 argv 长度限制。
//   gemini —— Google Generative Language API（用户自配 API Key），SSE 流式；
//              接口地址可用 AGENT_BRIDGE_GEMINI_BASE 覆盖（测试用 mock）。
//              Node 内置 fetch 不认代理环境变量，Gemini 有地域封锁，
//              故显式支持代理：设置里的代理地址优先，其次环境变量。
// CLI 引擎可用环境变量覆盖命令与参数（AGENT_BRIDGE_{CLAUDE,CODEX}_{COMMAND,ARGS}）。
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export function normalizeEngine(value) {
  if (value === 'codex' || value === 'gemini') return value;
  return 'claude';
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

function geminiProxy(env, gemini) {
  return gemini?.proxy
    || env.HTTPS_PROXY || env.https_proxy
    || env.HTTP_PROXY || env.http_proxy
    || env.ALL_PROXY || env.all_proxy
    || '';
}

async function runGemini(prompt, onDelta, env, gemini) {
  const apiKey = gemini?.apiKey;
  if (!apiKey) throw new Error('尚未配置 Gemini API Key，请在 AI 面板的设置（⚙）里填写。');
  const base = env.AGENT_BRIDGE_GEMINI_BASE || 'https://generativelanguage.googleapis.com';
  const model = gemini.model || 'gemini-2.5-flash';
  const proxy = geminiProxy(env, gemini);
  const doFetch = proxy
    ? (url, init) => undiciFetch(url, { ...init, dispatcher: new ProxyAgent(proxy) })
    : fetch;
  const response = await doFetch(
    `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    }
  );
  if (!response.ok || !response.body) {
    let message = `Gemini 接口返回 ${response.status}`;
    try {
      const detail = await response.json();
      if (detail?.error?.message) message = 'Gemini：' + detail.error.message;
    } catch {}
    throw new Error(message);
  }

  // 真实接口的 SSE 事件用 \r\n\r\n 分隔（规范允许 CRLF），流末尾可能没有分隔符。
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let finishInfo = '';
  const consumePacket = (packet) => {
    for (const line of packet.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      let payload = null;
      try { payload = JSON.parse(line.slice(5).trim()); } catch {}
      const candidate = payload?.candidates?.[0];
      // 思考模型的推理片段（thought）不属于回答正文
      const text = candidate?.content?.parts
        ?.filter((item) => !item.thought)
        .map((item) => item.text || '').join('') || '';
      if (text) {
        answer += text;
        onDelta(text);
      }
      const reason = payload?.promptFeedback?.blockReason || candidate?.finishReason;
      if (reason && reason !== 'STOP') finishInfo = reason;
    }
  };
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    buffer += decoder.decode(part.value, { stream: true });
    const packets = buffer.split(/\r?\n\r?\n/);
    buffer = packets.pop() || '';
    packets.forEach(consumePacket);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumePacket(buffer);
  if (!answer.trim()) {
    throw new Error('Gemini 未返回文本' + (finishInfo ? '（' + finishInfo + '）' : '，请检查模型名或稍后重试'));
  }
  return answer.trim();
}

export function runEngine(engine, prompt, onDelta, env = process.env, options = {}) {
  if (engine === 'gemini') return runGemini(prompt, onDelta, env, options.gemini);
  return engine === 'codex' ? runCodex(prompt, onDelta, env) : runClaude(prompt, onDelta, env);
}
