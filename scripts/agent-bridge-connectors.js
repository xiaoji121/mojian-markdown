// 飞书 / 钉钉连接器：把当前 Markdown 发布成在线文档，借它们现成的承载与分享能力。
// 走本机已登录的官方 CLI，凭据全程留在本机，墨笺不接触任何 token：
//   飞书 —— `lark-cli markdown +create`，该 shortcut 自带回查真实访问 URL；
//   钉钉 —— `dws doc create --content-file`，长/多行内容走文件避免 shell 转义。
// 命令与前置参数可用环境变量覆盖（AGENT_BRIDGE_{LARK,DWS}_{COMMAND,ARGS}），
// 便于自定义安装路径与测试注入假 CLI。
// 与 Agent 模式的分工：这里是确定性路径（可预期、可测），Agent 那条是柔性路径。
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CONNECTORS = {
  feishu: {
    label: '飞书',
    envCommand: 'AGENT_BRIDGE_LARK_COMMAND',
    envArgs: 'AGENT_BRIDGE_LARK_ARGS',
    command: 'lark-cli',
    baseArgs: ['markdown', '+create'],
    fileFlag: '--file',
    folderFlag: '--folder-token',
    // lark-cli 拒收绝对路径（"unsafe file path: --file must be a relative path
    // within the current directory"），所以在临时目录里执行并传相对路径。
    relativeFile: true,
    // lark-cli 的 markdown +create 要求文件名带 .md 后缀
    docName: (name) => (/\.md$/i.test(name) ? name : `${name}.md`),
    authArgs: ['auth', 'status', '--json'],
    loginCommand: 'lark-cli auth login',
    missing: '未找到 lark-cli。请先安装并登录飞书 CLI（lark-cli auth login），或设置 AGENT_BRIDGE_LARK_COMMAND。'
  },
  dingtalk: {
    label: '钉钉',
    envCommand: 'AGENT_BRIDGE_DWS_COMMAND',
    envArgs: 'AGENT_BRIDGE_DWS_ARGS',
    command: 'dws',
    baseArgs: ['doc', 'create'],
    fileFlag: '--content-file',
    folderFlag: '--folder',
    // dws 接受绝对路径（已实测），保持原样即可
    relativeFile: false,
    // 钉钉文档名是标题而非文件名，.md 后缀反而碍眼
    docName: (name) => name.replace(/\.md$/i, ''),
    authArgs: ['auth', 'status', '--format', 'json'],
    loginCommand: 'dws auth login',
    missing: '未找到 dws。请先安装并登录钉钉 CLI（dws auth login），或设置 AGENT_BRIDGE_DWS_COMMAND。'
  }
};

function authIsAvailable(target, result) {
  if (target === 'feishu') {
    return Object.values(result?.identities || {}).some((identity) => identity?.available === true);
  }
  return result?.success === true && result?.authenticated === true && result?.token_valid === true;
}

function probeConnector(target, env) {
  const connector = CONNECTORS[target];
  const command = env[connector.envCommand] || connector.command;
  return new Promise((resolve) => {
    const child = spawn(command, connector.authArgs, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ available: false, reason: `${connector.label} CLI 状态检测超时` });
    }, 4000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => finish({
      available: false,
      reason: error.code === 'ENOENT'
        ? `未安装 ${connector.command}`
        : `${connector.label} CLI 检测失败：${error.message}`
    }));
    child.on('close', (code) => {
      const result = parseCliJson(stdout);
      if (code === 0 && authIsAvailable(target, result)) return finish({ available: true, reason: '' });
      const detail = cliErrorMessage(result) || stderr.trim();
      finish({
        available: false,
        reason: detail
          ? `${connector.label}登录失效：${detail.slice(0, 160)}`
          : `${connector.label}未登录或登录已失效，请运行 ${connector.loginCommand}`
      });
    });
  });
}

export async function connectorCapabilities(env = process.env) {
  const [feishu, dingtalk] = await Promise.all([
    probeConnector('feishu', env),
    probeConnector('dingtalk', env)
  ]);
  return { feishu, dingtalk };
}

export function normalizeTarget(value) {
  if (Object.prototype.hasOwnProperty.call(CONNECTORS, value)) return value;
  throw new Error(`不支持的发布目标：${value}。目前支持 feishu、dingtalk。`);
}

export function connectorLabel(target) {
  return CONNECTORS[normalizeTarget(target)].label;
}

export function connectorInvocation(target, { name, file, env = process.env, folder = '' } = {}) {
  const connector = CONNECTORS[normalizeTarget(target)];
  const command = env[connector.envCommand] || connector.command;
  const base = env[connector.envArgs]
    ? env[connector.envArgs].split(' ').filter(Boolean)
    : [...connector.baseArgs];
  const args = [
    ...base,
    '--name', connector.docName(String(name || '未命名')),
    connector.fileFlag, file,
    '--format', 'json'
  ];
  if (folder) args.push(connector.folderFlag, folder);
  return { command, args, docName: connector.docName(String(name || '未命名')) };
}

// CLI 的 JSON 结构会随版本变化，不绑定字段路径：递归找第一个 http(s) 链接。
export function pickUrl(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return '';
  if (typeof value === 'string') return /^https?:\/\//.test(value.trim()) ? value.trim() : '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickUrl(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const item of Object.values(value)) {
    const found = pickUrl(item, depth + 1);
    if (found) return found;
  }
  return '';
}

// CLI 会在 JSON 前打进度行，从第一个 { 开始解析。
function parseCliJson(stdout) {
  const at = stdout.indexOf('{');
  if (at < 0) return null;
  try {
    return JSON.parse(stdout.slice(at));
  } catch {
    return null;
  }
}

function cliErrorMessage(result) {
  const detail = result?.error?.message || result?.message || result?.msg;
  return detail ? String(detail) : '';
}

// 两个 CLI 的成功标记不同名：lark-cli 用 ok，dws 用 success。
function cliFailed(result) {
  return result?.ok === false || result?.success === false;
}

function runConnector(invocation, missingMessage, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env,
      ...(cwd ? { cwd } : {}),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      reject(error.code === 'ENOENT' ? new Error(missingMessage) : error);
    });
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      // CLI 的报错原样透出（截断防止刷屏），不吞错也不改写。
      const detail = (stderr.trim() || stdout.trim() || `退出码 ${code}`).slice(0, 400);
      reject(new Error(`${invocation.command} 执行失败：${detail}`));
    });
  });
}

export async function publishDocument(target, { fileName, content, env = process.env, folder = '' } = {}) {
  const normalized = normalizeTarget(target);
  const connector = CONNECTORS[normalized];
  const body = typeof content === 'string' ? content : '';
  if (!body.trim()) throw new Error('当前文档没有内容，已跳过发布。');

  const dir = await mkdtemp(join(tmpdir(), 'mojian-publish-'));
  const file = join(dir, 'document.md');
  try {
    await writeFile(file, body, 'utf8');
    const invocation = connectorInvocation(normalized, {
      name: fileName,
      file: connector.relativeFile ? './document.md' : file,
      env,
      folder
    });
    // relativeFile 的 CLI 只认当前目录下的相对路径，故在暂存目录里执行。
    const stdout = await runConnector(invocation, connector.missing, env, connector.relativeFile ? dir : '');
    const raw = parseCliJson(stdout);
    if (cliFailed(raw)) {
      throw new Error(`${connector.label}发布失败：${cliErrorMessage(raw) || stdout.slice(0, 200)}`);
    }
    return {
      target: normalized,
      label: connector.label,
      name: invocation.docName,
      // 解析不出链接不算失败：文档可能已经建好，把原始结果带回去供排查。
      url: raw ? pickUrl(raw) : '',
      raw: raw || { stdout: stdout.slice(0, 400) }
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
