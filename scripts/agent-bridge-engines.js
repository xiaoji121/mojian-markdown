// AI 问答引擎：本地 CLI 与 API Key 提供方的调用抽象。
//   claude —— `claude -p <prompt>`，stdout 即回答，天然流式。
//   codex  —— `codex exec`，stdout 是进度噪音（thinking、token 统计等），
//              干净的最终回答通过 --output-last-message 落盘后一次性取回；
//              提示词经 stdin 传入，避免长文档超出 argv 长度限制。
//
// 两种模式（mode）：
//   chat（默认）—— 只会说话：不给工具、不切工作目录、不留会话，与历史行为完全一致。
//   agent      —— 会做事：这两个 CLI 本身就是 agent loop，我们只是按需解开三处限制：
//                 ① 工具白名单（精确到命令前缀，够用即止）
//                 ② 工作目录 = 文档所属工程根，等价于「在那个目录下敲 claude」
//                 ③ 会话可续接（claude --session-id/--resume；codex 去掉 --ephemeral + exec resume）
//              两个 CLI 的权限粒度不同，这点无法抹平：claude 是工具级白名单，
//              codex 只有沙箱级（workspace-write + 放开网络访问，否则 CLI 连不上飞书/钉钉）。
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
  if (['codex', 'gemini', 'kimi', 'qwen', 'custom'].includes(value)) return value;
  return 'claude';
}

export function normalizeMode(value) {
  return value === 'agent' ? 'agent' : 'chat';
}

// Agent 模式的 claude 工具白名单：只给这个功能真正需要的，写文件是独立开关。
// 读工程拿上下文（Read/Glob/Grep）+ 两个连接器 CLI（发布到飞书/钉钉）。
const AGENT_READ_TOOLS = ['Read', 'Glob', 'Grep'];
const AGENT_CONNECTOR_TOOLS = ['Bash(lark-cli:*)', 'Bash(dws:*)'];
const AGENT_WRITE_TOOLS = ['Write', 'Edit'];

export function agentAllowedTools(allowWrite = false) {
  return [
    ...AGENT_READ_TOOLS,
    ...AGENT_CONNECTOR_TOOLS,
    ...(allowWrite ? AGENT_WRITE_TOOLS : [])
  ].join(',');
}

function claudeInvocation(prompt, { env, mode, cwd, sessionId, resumeSessionId, allowWrite, addDirs }) {
  const command = env.AGENT_BRIDGE_CLAUDE_COMMAND || 'claude';
  const base = env.AGENT_BRIDGE_CLAUDE_ARGS
    ? env.AGENT_BRIDGE_CLAUDE_ARGS.split(' ').filter(Boolean)
    : ['-p'];
  if (mode !== 'agent') {
    // 历史行为：提示词作为尾参。
    return { command, args: [...base, prompt], stdinPrompt: null, cwd: '' };
  }
  // --allowedTools / --add-dir 都是可变参数，尾随的提示词会被吞掉，
  // 因此 Agent 模式一律走 stdin —— 顺带绕开长文档的 argv 长度上限。
  const args = [...base, '--allowedTools', agentAllowedTools(allowWrite)];
  (addDirs || []).filter(Boolean).forEach((dir) => args.push('--add-dir', dir));
  if (resumeSessionId) args.push('--resume', resumeSessionId);
  else if (sessionId) args.push('--session-id', sessionId);
  return { command, args, stdinPrompt: prompt, cwd: cwd || '' };
}

function codexInvocation(prompt, { env, mode, cwd, outputFile, resumeSessionId, addDirs }) {
  const command = env.AGENT_BRIDGE_CODEX_COMMAND || 'codex';
  const override = env.AGENT_BRIDGE_CODEX_ARGS
    ? env.AGENT_BRIDGE_CODEX_ARGS.split(' ').filter(Boolean)
    : null;
  let args;
  if (mode !== 'agent') {
    args = override || ['exec', '--skip-git-repo-check', '--color', 'never', '--sandbox', 'read-only', '--ephemeral'];
    args = [...args];
  } else if (resumeSessionId) {
    // `codex exec resume` 不接受 -C/--cd、--sandbox、--color：
    // 工作目录只能靠子进程 cwd，沙箱只能用 -c 覆盖配置。
    args = [
      ...(override || ['exec']), 'resume', resumeSessionId,
      '--skip-git-repo-check', '--json',
      '-c', 'sandbox_mode="workspace-write"',
      '-c', 'sandbox_workspace_write.network_access=true'
    ];
  } else {
    // 不加 --ephemeral：会话必须落盘，下一轮才能 resume。
    args = [
      ...(override || ['exec']),
      '--skip-git-repo-check', '--color', 'never',
      '--sandbox', 'workspace-write',
      '-c', 'sandbox_workspace_write.network_access=true',
      '--json'
    ];
    (addDirs || []).filter(Boolean).forEach((dir) => args.push('--add-dir', dir));
  }
  if (outputFile) args.push('--output-last-message', outputFile);
  args.push('-');
  return { command, args, stdinPrompt: prompt, cwd: mode === 'agent' ? (cwd || '') : '' };
}

export function engineInvocation(engine, prompt, options = {}) {
  const settings = {
    env: options.env || process.env,
    outputFile: options.outputFile || '',
    mode: normalizeMode(options.mode),
    cwd: options.cwd || '',
    sessionId: options.sessionId || '',
    resumeSessionId: options.resumeSessionId || '',
    allowWrite: !!options.allowWrite,
    addDirs: options.addDirs || []
  };
  return engine === 'codex'
    ? codexInvocation(prompt, settings)
    : claudeInvocation(prompt, settings);
}

function missingCliMessage(engine) {
  return engine === 'codex'
    ? '未找到 Codex CLI。请先安装并登录 codex，或设置 AGENT_BRIDGE_CODEX_COMMAND。'
    : '未找到 Claude CLI。请先安装并登录 Claude Code，或设置 AGENT_BRIDGE_CLAUDE_COMMAND。';
}

function spawnEngine(engine, invocation, onStdout) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      // Agent 模式把工作目录设成文档所属工程根；问答模式不带 cwd，沿用桥接进程目录。
      ...(invocation.cwd ? { cwd: invocation.cwd } : {}),
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

// Agent 模式的会话 id：claude 的由调用方生成并传入，codex 的要从 --json 事件里捕获。
function reportSession(options, id) {
  if (id && typeof options.onSession === 'function') options.onSession(id);
}

async function runClaude(prompt, onDelta, env, options = {}) {
  let answer = '';
  const invocation = engineInvocation('claude', prompt, { ...options, env });
  await spawnEngine('claude', invocation, (delta) => {
    answer += delta;
    onDelta(delta);
  });
  if (normalizeMode(options.mode) === 'agent') {
    reportSession(options, options.resumeSessionId || options.sessionId);
  }
  return answer.trim();
}

function reportProgress(options, label, state = 'done') {
  if (label && typeof options.onProgress === 'function') options.onProgress({ label, state });
}

// 只转译可观察的执行状态；reasoning 文本与命令参数都不透出，避免泄露隐藏推理或敏感值。
function codexProgress(event) {
  const item = event?.item || {};
  if (event?.type === 'turn.started') return { label: '开始分析请求', state: 'running' };
  if (event?.type === 'turn.completed') return { label: '正在整理回答', state: 'done' };
  if (event?.type === 'item.completed' && item.type === 'reasoning') return { label: '完成一步分析', state: 'done' };
  if (event?.type === 'item.started' && item.type === 'command_execution') return { label: '正在执行命令', state: 'running' };
  if (event?.type === 'item.completed' && item.type === 'command_execution') return { label: '命令执行完成', state: 'done' };
  if (event?.type === 'item.started' && item.type === 'mcp_tool_call') return { label: '正在调用工具', state: 'running' };
  if (event?.type === 'item.completed' && item.type === 'mcp_tool_call') return { label: '工具调用完成', state: 'done' };
  if (event?.type === 'item.completed' && item.type === 'file_change') {
    const paths = (item.changes || []).map((change) => change?.path).filter(Boolean);
    return { label: '已更新文件' + (paths.length ? ' · ' + paths.slice(0, 2).join('、') : ''), state: 'done' };
  }
  return null;
}

// codex 的 --json 是 JSONL 事件流：捕获会话 id，并生成安全的执行进度摘要。
function createCodexEventReader(options) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim().startsWith('{')) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === 'thread.started') reportSession(options, event.thread_id);
        const progress = codexProgress(event);
        if (progress) reportProgress(options, progress.label, progress.state);
      } catch {}
    }
  };
}

async function runCodex(prompt, onDelta, env, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'mojian-codex-'));
  const outputFile = join(dir, 'answer.md');
  try {
    // stdout 是人类可读进度 / JSON 事件，不进入回答；只取 --output-last-message 的最终消息。
    const invocation = engineInvocation('codex', prompt, { ...options, env, outputFile });
    const onStdout = normalizeMode(options.mode) === 'agent' ? createCodexEventReader(options) : () => {};
    await spawnEngine('codex', invocation, onStdout);
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
  return engine === 'codex'
    ? runCodex(prompt, onDelta, env, options)
    : runClaude(prompt, onDelta, env, options);
}
