import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { mockCliEnv } from '../helpers/mockCli.ts';
import { resolveCliInvocation, spawnCli } from '../../scripts/agent-bridge-process.js';
import * as processHelpers from '../../scripts/agent-bridge-process.js';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Template emitted by npm/cmd-shim for a #!/usr/bin/env node entrypoint.
function npmShim(target = 'node_modules\\mock-cli\\cli.cjs') {
  return [
    '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b',
    ':start', 'SETLOCAL', 'CALL :find_dp0', '',
    'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"',
    ') ELSE (', '  SET "_prog=node"', '  SET PATHEXT=%PATHEXT:;.JS;=;%', ')', '',
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${target}" %*`, ''
  ].join('\r\n');
}

function legacyShim(target = 'node_modules\\mock-cli\\cli.js') {
  return [
    '@IF EXIST "%~dp0\\node.exe" (', `  "%~dp0\\node.exe" "%~dp0\\${target}" %*`,
    ') ELSE (', '  @SETLOCAL', '  @SET PATHEXT=%PATHEXT:;.JS;=;%',
    `  node "%~dp0\\${target}" %*`, ')', ''
  ].join('\r\n');
}

function windowsRuntime(files: Record<string, string> = {}, extra = {}) {
  const entries = new Map(Object.entries(files).map(([file, text]) => [win32.normalize(file).toLowerCase(), text]));
  return {
    platform: 'win32', cwd: 'C:\\work', execPath: 'C:\\runtime\\node.exe', electron: false,
    isFile: (file: string) => entries.has(win32.normalize(file).toLowerCase()),
    readFile: (file: string) => {
      const content = entries.get(win32.normalize(file).toLowerCase());
      if (content === undefined) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
      return content;
    },
    ...extra
  };
}

const argv = ['中文 空格', '"quoted"', 'a&b|c<d>e', '%PATH%', '!name!', '^caret', 'line1\nline2', 'trailing\\', ''];

test('Windows npm shim resolves case-insensitive Path/PATHEXT and preserves literal arguments', () => {
  const root = 'C:\\用户 空格\\npm';
  const entrypoint = root + '\\node_modules\\mock-cli\\cli.cjs';
  const runtime = windowsRuntime({ [root + '\\mock.cmd']: npmShim(), [entrypoint]: '' });
  const env = { Path: 'C:\\missing;"' + root + '"', Pathext: '.EXE;.CMD' };
  const result = resolveCliInvocation('mock', argv, { env, cwd: 'C:\\项目 空格', stdio: 'pipe' }, runtime);
  assert.equal(result.command, runtime.execPath);
  assert.deepEqual(result.args, [entrypoint, ...argv]);
  assert.equal(result.options.env, env);
  assert.equal(result.options.cwd, 'C:\\项目 空格');
  assert.equal(result.options.stdio, 'pipe');
  assert.equal(result.options.shell, false);
  assert.equal(result.options.windowsVerbatimArguments, false);
});

test('Windows native executable follows PATHEXT order without being mistaken for a shim', () => {
  const runtime = windowsRuntime({ 'C:\\bin\\mock.cmd': npmShim(), 'C:\\bin\\mock.exe': '' });
  const result = resolveCliInvocation('mock', argv, { env: { PATH: 'C:\\bin', PATHEXT: '.EXE;.CMD' } }, runtime);
  assert.equal(result.command, 'C:\\bin\\mock.EXE');
  assert.deepEqual(result.args, argv);
});

test('Windows ignores the Unix npm sibling and honors explicit .CMD and relative cwd', () => {
  const target = 'C:\\项目 空格\\tools\\node_modules\\mock-cli\\cli.cjs';
  const runtime = windowsRuntime({
    'C:\\项目 空格\\tools\\mock': '#!/bin/sh\nmalicious',
    'C:\\项目 空格\\tools\\mock.cmd': npmShim(), [target]: '',
    'C:\\项目 空格\\tools\\node.exe': ''
  });
  for (const command of ['.\\tools\\mock.CMD', '.\\tools\\mock']) {
    const result = resolveCliInvocation(command, argv, { cwd: 'C:\\项目 空格', env: {} }, runtime);
    assert.equal(result.command, 'C:\\项目 空格\\tools\\node.exe');
    assert.deepEqual(result.args, [target, ...argv]);
  }
});

test('Windows supports old npm Node shims and resolves node.exe on PATH', () => {
  const target = 'C:\\bin\\node_modules\\mock-cli\\cli.js';
  const runtime = windowsRuntime({
    'C:\\bin\\mock.cmd': legacyShim(), [target]: '', 'C:\\Node JS\\node.exe': ''
  }, { electron: true, execPath: 'C:\\app\\墨笺.exe' });
  const result = resolveCliInvocation('mock', [], { env: { Path: 'C:\\bin;C:\\Node JS' } }, runtime);
  assert.equal(result.command.toLowerCase(), 'c:\\node js\\node.exe');
  assert.deepEqual(result.args, [target]);
});

test('Windows refuses arbitrary/modified batch wrappers and non-Node shims without executing them', () => {
  for (const content of [
    '@echo off\r\nnode cli.js %*',
    npmShim() + 'del "C:\\important"\r\n',
    '// ' + npmShim(),
    npmShim().replace('SET "_prog=node"', 'SET "_prog=python"'),
    npmShim().replace('%dp0%\\node_modules', '%USERPROFILE%\\node_modules'),
    legacyShim().replace(/node_modules\\mock-cli\\cli.js(?=" %\*\r\n\))/, 'other.js')
  ]) {
    const runtime = windowsRuntime({ 'C:\\bin\\mock.cmd': content });
    assert.throws(() => resolveCliInvocation('mock', [], { env: { Path: 'C:\\bin' } }, runtime),
      (error: Error & { code?: string }) => error.code === 'ECLI_UNSUPPORTED_SHIM' && /\.exe|Node|node/i.test(error.message));
  }
});

test('Windows refuses .bat wrappers even when content resembles npm and reports broken entrypoints', () => {
  const runtime = windowsRuntime({ 'C:\\bin\\mock.bat': npmShim(), 'C:\\bin\\broken.cmd': npmShim() });
  assert.throws(() => resolveCliInvocation('C:\\bin\\mock.bat', [], {}, runtime), { code: 'ECLI_UNSUPPORTED_SHIM' });
  assert.throws(() => resolveCliInvocation('C:\\bin\\broken.cmd', [], {}, runtime), { code: 'ENOENT' });
});

test('Windows does not fall back to Electron as a Node executable', () => {
  const runtime = windowsRuntime({
    'C:\\bin\\mock.cmd': npmShim(), 'C:\\bin\\node_modules\\mock-cli\\cli.cjs': ''
  }, { electron: true, execPath: 'C:\\app\\墨笺.exe' });
  assert.throws(() => resolveCliInvocation('mock', [], { env: { Path: 'C:\\bin' } }, runtime),
    (error: Error & { code?: string }) => error.code === 'ECLI_NODE_NOT_FOUND' && /Node/.test(error.message));
});

test('missing commands remain unchanged for native spawn ENOENT reporting', () => {
  const result = resolveCliInvocation('missing-cli-xyz', [], { env: {} }, windowsRuntime());
  assert.equal(result.command, 'missing-cli-xyz');
  assert.equal(result.options.shell, false);
});

test('POSIX invocation preserves executable/env/cwd and always disables shell interpretation', () => {
  const env = { PATH: '/bin', TEST_MARKER: 'kept' };
  const options = { env, cwd: '/项目 空格', shell: true, windowsVerbatimArguments: true };
  const result = resolveCliInvocation('/bin/tool', argv, options, { platform: 'linux' });
  assert.equal(result.command, '/bin/tool');
  assert.deepEqual(result.args, argv);
  assert.equal(result.options.env, env);
  assert.equal(result.options.cwd, options.cwd);
  assert.equal(result.options.shell, false);
  assert.equal(result.options.windowsVerbatimArguments, false);
  assert.equal(options.shell, true, 'must not mutate caller options');
});

async function collect(child: ReturnType<typeof spawnCli>, input = '') {
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { code, stdout, stderr };
}

test('spawnCli returns a real streaming child, preserves stdin/argv/cwd/env and nonzero exits', async () => {
  const cwd = await mkdtemp(join(tmpdir(), '进程 test '));
  try {
    const script = join(cwd, 'argv.cjs');
    await writeFile(script, `let input = ''; process.stdin.on('data', c => input += c);
      process.stdin.on('end', () => { console.log(JSON.stringify({ argv: process.argv.slice(2), input,
        cwd: process.cwd(), env: process.env.MOJIAN_TEST_MARKER })); console.error('expected failure'); process.exitCode = 7; });`);
    const child = spawnCli(process.execPath, [script, ...argv], {
      cwd, env: { ...mockCliEnv(cwd), MOJIAN_TEST_MARKER: '保留 env' }, stdio: 'pipe'
    });
    assert.equal(typeof child.kill, 'function');
    const result = await collect(child, 'stdin & 中文\n');
    assert.equal(result.code, 7);
    assert.deepEqual(JSON.parse(result.stdout), { argv, input: 'stdin & 中文\n', cwd, env: '保留 env' });
    assert.match(result.stderr, /expected failure/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('spawnCli missing executable emits ENOENT asynchronously', async () => {
  await assert.rejects(collect(spawnCli('mojian-definitely-missing-cli-xyz', [], { env: {}, stdio: 'pipe' })), { code: 'ENOENT' });
});

test('Windows executes real npm shim in Chinese/space path without cmd argument expansion', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), '墨笺 npm test '));
  try {
    const target = join(root, 'node_modules', 'mock-cli', 'cli.cjs');
    await mkdir(join(root, 'node_modules', 'mock-cli'), { recursive: true });
    await writeFile(target, `process.stdout.write(JSON.stringify(process.argv.slice(2)));`);
    await writeFile(join(root, 'mojian-test-process.cmd'), npmShim());
    const env = mockCliEnv(root);
    const result = await collect(spawnCli('mojian-test-process', argv, { cwd: root, env, stdio: 'pipe' }));
    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(result.stdout), argv);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


function fakeKiller() {
  const child = new EventEmitter() as any;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { child.wasKilled = true; return true; };
  return child;
}

test('tree-managed POSIX launch creates a dedicated process group and consumes its private option', () => {
  const result = resolveCliInvocation('/node', [], { processTree: true }, { platform: 'linux' });
  assert.equal(result.options.detached, true);
  assert.equal('processTree' in result.options, false);
  const windows = resolveCliInvocation('missing', [], { processTree: true, env: {} }, windowsRuntime());
  assert.equal('processTree' in windows.options, false);
  assert.notEqual(windows.options.detached, true);
});

test('Windows tree termination uses only absolute taskkill and numeric PID argv', async () => {
  const calls: any[] = [];
  const killer = fakeKiller();
  const completion = processHelpers.terminateCli({ pid: 4321 }, {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    spawn: (...args: any[]) => { calls.push(args); return killer; }
  });
  killer.emit('close', 0);
  await completion;
  assert.equal(calls[0][0], 'C:\\Windows\\System32\\taskkill.exe');
  assert.deepEqual(calls[0][1], ['/PID', '4321', '/T', '/F']);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].windowsHide, true);
});

test('Windows tree termination exposes taskkill failure and bounds a stuck taskkill', async () => {
  const failed = fakeKiller();
  const failure = processHelpers.terminateCli({ pid: 4321 }, {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, spawn: () => failed
  });
  failed.stderr.write('Access is denied.');
  failed.emit('close', 1);
  await assert.rejects(failure, (error: Error & { code?: string }) =>
    error.code === 'ECLI_TERMINATION_FAILED' && /Access is denied/.test(error.message));
  const stuck = fakeKiller();
  await assert.rejects(processHelpers.terminateCli({ pid: 4321 }, {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, spawn: () => stuck, timeoutMs: 20
  }), { code: 'ECLI_TERMINATION_TIMEOUT' });
  assert.equal(stuck.wasKilled, true);
});

test('tree termination rejects invalid PIDs and reports OS permission errors safely', async () => {
  const spawn = () => { throw new Error('must not launch taskkill'); };
  await assert.rejects(processHelpers.terminateCli({ pid: '4321 & whoami' }, {
    platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, spawn
  }), { code: 'ECLI_TERMINATION_FAILED' });
  await assert.rejects(processHelpers.terminateCli({ pid: 4321 }, {
    platform: 'win32', env: { SystemRoot: 'relative' }, spawn
  }), { code: 'ECLI_TERMINATION_FAILED' });
  await assert.rejects(processHelpers.terminateCli({ pid: 4321 }, {
    platform: 'linux', kill: () => { throw Object.assign(new Error('Permission denied'), { code: 'EPERM' }); }
  }), (error: Error & { code?: string }) => error.code === 'ECLI_TERMINATION_FAILED' && /Permission denied/.test(error.message));
});

test('tree termination closes inherited stdio held open by a wrapper descendant', { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), '墨笺 process tree '));
  let child: any;
  let descendantPid: number | undefined;
  try {
    const wrapper = join(root, 'wrapper.cjs');
    await writeFile(wrapper, `const {spawn} = require('node:child_process');
      const child = spawn(process.execPath, ['-e', "setTimeout(() => process.exit(0), 6000)"],
        {stdio: ['ignore', 'inherit', 'inherit']});
      process.stdout.write(String(child.pid) + '\\n');
      setTimeout(() => process.exit(0), 6000);`);
    child = spawnCli(process.execPath, [wrapper], { processTree: true, env: mockCliEnv(root), stdio: 'pipe' });
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    descendantPid = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('wrapper did not start')), 2000);
      child.once('error', (error: Error) => { clearTimeout(timer); reject(error); });
      child.stdout.once('data', (chunk: Buffer) => { clearTimeout(timer); resolve(Number(String(chunk).trim())); });
    });
    assert.ok(Number.isSafeInteger(descendantPid) && descendantPid! > 0);
    await processHelpers.terminateCli(child);
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([closed, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('descendant kept inherited stdio open after cancellation')), 2000);
      })]);
    } finally {
      clearTimeout(timer!);
    }
  } finally {
    // Red runs and failed assertions must never leave the bounded fake processes behind.
    for (const pid of [descendantPid, child?.pid]) {
      if (Number.isSafeInteger(pid) && pid > 0) {
        try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
    await rm(root, { recursive: true, force: true });
  }
});
