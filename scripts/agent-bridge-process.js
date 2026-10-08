// CLI 进程边界：Windows 的 npm .cmd 只读取已知 Node shim，直接启动 JS，绝不经过 cmd.exe。
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

function windowsEnv(env, name) {
  // Node 在 Windows 下按字典序选取第一个大小写不敏感的环境变量名。
  const key = Object.keys(env).sort().find((key) => key.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

function resolveWindowsCommand(command, env, cwd, fileExists) {
  const extensions = String(windowsEnv(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD')
    .split(';').filter((ext) => /^\.[\w]+$/.test(ext));
  const hasExtension = !!win32.extname(command);
  const suffixes = hasExtension ? [''] : extensions;
  const directories = /[\\/:]/.test(command)
    ? ['']
    : [cwd, ...String(windowsEnv(env, 'PATH') || '').split(';')];
  for (const directory of directories) {
    const unquoted = directory.trim().replace(/^"(.*)"$/, '$1');
    const base = win32.resolve(cwd, unquoted, command);
    for (const extension of suffixes) {
      if (fileExists(base + extension)) return base + extension;
    }
  }
  return null;
}

const NPM_HEAD = [
  'ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b',
  ':start', 'SETLOCAL', 'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (', 'SET "_prog=%dp0%\\node.exe"',
  ') ELSE (', 'SET "_prog=node"', 'SET PATHEXT=%PATHEXT:;.JS;=;%', ')'
];

function sameLines(actual, expected) {
  return actual.length === expected.length
    && actual.every((line, index) => line.toLowerCase() === expected[index].toLowerCase());
}

function modernNpmTarget(lines) {
  if (!sameLines(lines.slice(0, -1), NPM_HEAD)) return null;
  const match = lines.at(-1).match(
    /^endLocal & goto #_undefined_# 2>NUL \|\| title %COMSPEC% & "%_prog%"\s+"%dp0%\\([^"\r\n%]+)"\s+%\*$/i
  );
  return match?.[1] || null;
}

function legacyNpmTarget(lines) {
  if (lines[0]?.toLowerCase() === 'echo off') lines = lines.slice(1);
  if (lines.length !== 7 || !sameLines(
    [lines[0], ...lines.slice(2, 5), lines[6]],
    ['IF EXIST "%~dp0\\node.exe" (', ') ELSE (', 'SETLOCAL', 'SET PATHEXT=%PATHEXT:;.JS;=;%', ')']
  )) return null;
  const local = lines[1].match(/^"%~dp0\\node\.exe"\s+"%~dp0\\([^"\r\n%]+)"\s+%\*$/i);
  const fromPath = lines[5].match(/^node\s+"%~dp0\\([^"\r\n%]+)"\s+%\*$/i);
  return local && fromPath && local[1] === fromPath[1] ? local[1] : null;
}

function unsupportedShim(command) {
  return Object.assign(new Error(
    `无法安全启动 ${command}：仅支持标准 npm Node .cmd 启动器。请重新安装 CLI，或将命令配置为原生 .exe / Node 可执行文件并单独传入脚本参数。`
  ), { code: 'ECLI_UNSUPPORTED_SHIM', path: command });
}

function npmTarget(command, runtime) {
  if (!/\.cmd$/i.test(command)) throw unsupportedShim(command);
  const lines = runtime.readFile(command, 'utf8').replace(/^\uFEFF/, '')
    .split(/\r?\n/).map((line) => line.trim().replace(/^@/, '')).filter(Boolean);
  const target = modernNpmTarget(lines) || legacyNpmTarget(lines);
  if (!target) throw unsupportedShim(command);
  const entrypoint = win32.resolve(win32.dirname(command), target);
  if (!runtime.isFile(entrypoint)) {
    throw Object.assign(new Error(`CLI 启动器的 Node 脚本不存在：${entrypoint}。请重新安装该 CLI。`), {
      code: 'ENOENT', path: entrypoint
    });
  }
  return entrypoint;
}

function nodeForShim(command, env, cwd, runtime) {
  const adjacent = win32.join(win32.dirname(command), 'node.exe');
  if (runtime.isFile(adjacent)) return adjacent;
  const fromPath = resolveWindowsCommand('node.exe', env, cwd, runtime.isFile);
  if (fromPath && /\.exe$/i.test(fromPath)) return fromPath;
  // Electron 的 execPath 是桌面应用，不是 Node；不可由它重复启动桌面窗口。
  if (!runtime.electron) return runtime.execPath;
  throw Object.assign(new Error(
    `无法启动 ${command}：未找到 Node.js（node.exe）。请安装 Node.js 并将它加入 PATH，或使用原生 CLI .exe。`
  ), { code: 'ECLI_NODE_NOT_FOUND', path: command });
}

// runtime 仅用于跨平台测试；正常调用保留真实平台、文件系统和进程语义。
export function resolveCliInvocation(command, args = [], options = {}, runtime = {}) {
  const { processTree = false, ...spawnOptions } = options;
  const resolvedOptions = { windowsHide: true, ...spawnOptions, shell: false, windowsVerbatimArguments: false };
  const context = {
    platform: process.platform, cwd: process.cwd(), execPath: process.execPath,
    electron: !!process.versions.electron, isFile, readFile: readFileSync, ...runtime
  };
  if (context.platform !== 'win32') {
    if (processTree) resolvedOptions.detached = true;
    return { command, args, options: resolvedOptions };
  }
  const env = options.env || process.env;
  const cwd = options.cwd instanceof URL ? fileURLToPath(options.cwd) : (options.cwd || context.cwd);
  const executable = resolveWindowsCommand(command, env, cwd, context.isFile);
  // 保留原生 spawn 的异步 ENOENT 事件，让上层沿用各 CLI 的安装提示。
  if (!executable) return { command, args, options: resolvedOptions };
  if (!/\.(cmd|bat)$/i.test(executable)) return { command: executable, args, options: resolvedOptions };
  const entrypoint = npmTarget(executable, context);
  return {
    command: nodeForShim(executable, env, cwd, context),
    args: [entrypoint, ...args], options: resolvedOptions
  };
}

const processGroups = new WeakSet();

// 已知不安全/损坏的 shim 在启动前抛错；否则返回真实 ChildProcess，保留流、退出码与 kill。
export function spawnCli(command, args = [], options = {}) {
  const invocation = resolveCliInvocation(command, args, options);
  const child = spawn(invocation.command, invocation.args, invocation.options);
  if (options.processTree && process.platform !== 'win32') processGroups.add(child);
  return child;
}

function terminationError(message, code = 'ECLI_TERMINATION_FAILED') {
  return Object.assign(new Error(`无法停止 CLI 进程树：${message}`), { code });
}

function terminateWindowsTree(pid, runtime) {
  const root = windowsEnv(runtime.env, 'SystemRoot');
  if (!root || !win32.isAbsolute(root)) {
    return Promise.reject(terminationError('SystemRoot 未设置为绝对路径，无法定位系统 taskkill.exe。'));
  }
  return new Promise((resolve, reject) => {
    let killer;
    try {
      killer = runtime.spawn(win32.join(root, 'System32', 'taskkill.exe'),
        ['/PID', String(pid), '/T', '/F'], {
          shell: false, windowsHide: true, windowsVerbatimArguments: false,
          stdio: ['ignore', 'ignore', 'pipe']
        });
    } catch (error) {
      reject(terminationError(error.message));
      return;
    }
    let stderr = '';
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    killer.stderr?.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    killer.once('error', (error) => finish(terminationError(error.message)));
    killer.once('close', (code) => finish(code === 0 ? null
      : terminationError(`taskkill 退出码 ${code}。${stderr.trim() || '请检查进程权限。'}`)));
    timer = setTimeout(() => {
      finish(terminationError(`taskkill 在 ${runtime.timeoutMs} 毫秒内未完成。请检查进程权限。`, 'ECLI_TERMINATION_TIMEOUT'));
      try { killer.kill('SIGKILL'); } catch {}
    }, runtime.timeoutMs);
  });
}

// processTree:true 的 POSIX 进程使用独立进程组；Windows 用系统 taskkill 终止普通子孙进程。
// 成功表示已发出终止请求；调用方仍应等待原 ChildProcess 的 close（并设置等待上限）。
export async function terminateCli(child, runtime = {}) {
  if (child.pid === undefined) return; // spawn 失败，没有系统进程需要清理。
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
    throw terminationError('无效的进程 PID。');
  }
  const context = {
    platform: process.platform, env: process.env, spawn, kill: process.kill.bind(process),
    timeoutMs: 5000, ...runtime
  };
  if (context.platform === 'win32') return terminateWindowsTree(child.pid, context);
  try {
    context.kill(processGroups.has(child) ? -child.pid : child.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw terminationError(error.message);
  }
}
