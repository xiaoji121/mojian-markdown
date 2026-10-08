import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, win32 } from 'node:path';
import { tmpdir } from 'node:os';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { request } from 'node:http';
import * as processHelpers from '../../scripts/agent-bridge-process.js';
import { startAgentBridge } from '../../scripts/agent-bridge.js';
import { createSettingsStore } from '../../scripts/agent-bridge-settings.js';
import { createMockCli, mockCliEnv } from '../helpers/mockCli.ts';
import { allowOnlyLoopbackConnections } from '../helpers/loopbackNetwork.ts';

allowOnlyLoopbackConnections();

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mojian-test-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...mockCliEnv(root), AGENT_BRIDGE_CLAUDE_COMMAND: 'mojian-test-readiness-claude',
    AGENT_BRIDGE_CODEX_COMMAND: 'mojian-test-readiness-codex' };
  return { root, env };
}

function rejectProcesses(t) {
  for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    t.mock.method(childProcess, method, () => { throw new Error('Readiness must never launch a process'); });
  }
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

function npmShim(target = 'node_modules\\mojian-test-clis\\mojian-test-readiness.cjs') {
  return `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\${target}" %*\r\n`;
}

function windowsRuntime(files = {}, extra = {}) {
  const entries = new Map(Object.entries(files).map(([path, value]) => [win32.normalize(path).toLowerCase(), value]));
  return {
    platform: 'win32', cwd: 'C:\\mojian-test-work', execPath: 'C:\\mojian-test-app\\app.exe', electron: true,
    isFile: (path) => entries.has(win32.normalize(path).toLowerCase()),
    readFile: (path) => entries.get(win32.normalize(path).toLowerCase()), ...extra
  };
}

const probe = (...args) => processHelpers.probeCliExecutable(...args);

test('readiness filesystem probe discovers fake CLIs without executing them or claiming login', async (t) => {
  const { root, env } = await fixture(t);
  await createMockCli(root, env.AGENT_BRIDGE_CLAUDE_COMMAND, 'throw new Error("must not run");');
  rejectProcesses(t);
  assert.equal(probe(env.AGENT_BRIDGE_CLAUDE_COMMAND, { env, cwd: root }), 'found');
  assert.equal(probe(env.AGENT_BRIDGE_CODEX_COMMAND, { env, cwd: root }), 'missing');
  const { readAiReadiness } = await import('../../scripts/agent-bridge-readiness.js');
  const result = await readAiReadiness({ settings: createSettingsStore(root), env, runtime: { cwd: root } });
  assert.deepEqual(result, {
    bridgeAvailable: true,
    providers: {
      claude: { executable: 'found', login: 'unverified' },
      codex: { executable: 'missing', login: 'unverified' },
      gemini: { configured: false, credentialStatus: 'empty', storage: 'plaintext', connection: 'unverified' }
    }
  });
  assert.equal(JSON.stringify(result).includes(root), false);
  assert.equal((await readdir(root)).includes('settings.json'), false);
});

test('POSIX readiness checks executable permissions and continues PATH past non-executable candidates', {
  skip: process.platform === 'win32'
}, async (t) => {
  const { root } = await fixture(t);
  const command = 'mojian-test-readiness-no-execute';
  await writeFile(join(root, command), '#!/bin/sh\nexit 0\n', { mode: 0o600 });
  const env = { PATH: root };
  assert.equal(probe(command, { env, cwd: root }), 'unavailable');
  await chmod(join(root, command), 0o700);
  assert.equal(probe(command, { env, cwd: root }), 'found');
  assert.equal(probe('./' + command, { env: { PATH: '' }, cwd: root }), 'found');
  assert.equal(probe(root, { env, cwd: root }), 'missing');
  const checked = [];
  const runtime = { platform: 'linux', cwd: '/mojian-test-work', isFile: () => true,
    access: (file) => { checked.push(file); if (file.startsWith('/mojian-test-denied/')) {
      throw Object.assign(new Error('private path must not escape'), { code: 'EACCES' });
    } } };
  assert.equal(probe(command, { env: { PATH: '/mojian-test-denied:/mojian-test-ready' } }, runtime), 'found');
  assert.equal(checked.length, 2);
});

test('Windows readiness validates npm shims, script entrypoints and an actual Node candidate', (t) => {
  rejectProcesses(t);
  const root = 'C:\\用户 空格\\mojian-test-bin';
  const command = root + '\\mojian-test-readiness.cmd';
  const script = root + '\\node_modules\\mojian-test-clis\\mojian-test-readiness.cjs';
  const options = { env: { Path: root, Pathext: '.EXE;.CMD' } };
  assert.equal(probe('mojian-test-readiness', options, windowsRuntime()), 'missing');
  assert.equal(probe('mojian-test-readiness', options, windowsRuntime({ [command]: '@echo malicious' })), 'unsupported');
  assert.equal(probe('mojian-test-readiness', options, windowsRuntime({ [command]: npmShim() })), 'unavailable');
  const files = { [command]: npmShim(), [script]: '' };
  assert.equal(probe('mojian-test-readiness', options, windowsRuntime(files)), 'unavailable');
  assert.equal(probe('mojian-test-readiness', options, windowsRuntime({ ...files, [root + '\\node.exe']: '' })), 'found');
  assert.equal(probe(command, { env: { Path: 'C:\\mojian-test-node' } }, windowsRuntime({
    ...files, 'C:\\mojian-test-node\\node.exe': ''
  })), 'found');
  assert.equal(probe(command, options, windowsRuntime(files, { electron: false,
    execPath: 'C:\\mojian-test-missing-node\\node.exe' })), 'unavailable');
  assert.equal(probe(root + '\\mojian-test-native.exe', options,
    windowsRuntime({ [root + '\\mojian-test-native.exe']: '' })), 'found');
  assert.equal(probe(root + '\\mojian-test-custom.ps1', options,
    windowsRuntime({ [root + '\\mojian-test-custom.ps1']: '' })), 'unsupported');
});

test('probe IO errors return only a stable state without command paths or exception text', () => {
  const runtime = windowsRuntime({}, { isFile: () => {
    throw Object.assign(new Error('secret-path-and-value'), { code: 'EACCES' });
  } });
  assert.equal(probe('mojian-test-readiness', { env: {} }, runtime), 'unavailable');
});

test('Gemini readiness uses status only and allowlists stored, migration, locked and unsupported states', async (t) => {
  rejectProcesses(t);
  const { readAiReadiness } = await import('../../scripts/agent-bridge-readiness.js');
  const { root, env } = await fixture(t);
  let nativeOperations = 0;
  const credentialAdapter = {
    status: () => ({ available: true, status: 'available' }),
    encrypt: () => { nativeOperations++; throw new Error('must not encrypt'); },
    decrypt: () => { nativeOperations++; throw new Error('must not decrypt'); }
  };
  const settings = createSettingsStore(root, { credentialAdapter });
  const read = () => readAiReadiness({ settings, env, runtime: { cwd: root } });
  const path = join(root, 'settings.json');
  const legacy = JSON.stringify({ providers: { gemini: { apiKey: 'mojian-test-fake-secret' } } });
  await writeFile(path, legacy);
  assert.deepEqual((await read()).providers.gemini, { configured: false, credentialStatus: 'migration-required',
    storage: 'available', connection: 'unverified' });
  assert.equal(await readFile(path, 'utf8'), legacy);
  const stored = JSON.stringify({ providers: { gemini: { credential: {
    version: 1, kind: 'electron-safe-storage', ciphertext: Buffer.from('mojian-test-fake-ciphertext').toString('base64')
  } } } });
  await writeFile(path, stored);
  for (const storage of ['available', 'locked', 'unsupported', 'unavailable']) {
    credentialAdapter.status = () => ({ available: storage === 'available', status: storage });
    assert.deepEqual((await read()).providers.gemini, { configured: true, credentialStatus: 'saved',
      storage, connection: 'unverified' });
    assert.equal(await readFile(path, 'utf8'), stored);
  }
  assert.equal(nativeOperations, 0);
  const extra = { providers: { gemini: { configured: true, credentialStatus: 'saved', apiKey: 'mojian-test-fake-secret',
    model: 'secret-model', proxy: 'http://private-host', extra: 'do-not-return' } }, secureStorage: { status: 'available', available: true } };
  const result = await readAiReadiness({ settings: { status: async () => extra }, env });
  assert.deepEqual(result.providers.gemini, { configured: true, credentialStatus: 'saved', storage: 'available', connection: 'unverified' });
});

test('readiness preserves malformed settings and never lets settings failures hide CLI status', async (t) => {
  const { root, env } = await fixture(t);
  const path = join(root, 'settings.json');
  const damaged = '{"apiKey":"mojian-test-fake-secret",';
  await writeFile(path, damaged);
  const { readAiReadiness } = await import('../../scripts/agent-bridge-readiness.js');
  const result = await readAiReadiness({ settings: createSettingsStore(root), env });
  assert.deepEqual(result.providers.gemini, { configured: false, credentialStatus: 'unavailable',
    storage: 'unavailable', connection: 'unverified' });
  assert.equal(result.providers.claude.executable, 'missing');
  assert.equal(await readFile(path, 'utf8'), damaged);
  assert.equal(JSON.stringify(result).includes('mojian-test-fake-secret'), false);
});

test('readiness HTTP route requires desktop capability, host and origin and only accepts reads', async (t) => {
  const { root, env } = await fixture(t);
  let reads = 0;
  const bridge = await startAgentBridge({ port: 0, root, cors: false,
    desktopCapability: 'mojian-test-capability', readinessOptions: { env, runtime: { cwd: root } },
    settingsStore: { status: async () => { reads++; return { providers: { gemini: { configured: false } } }; } }
  });
  t.after(() => bridge.close());
  const endpoint = bridge.url + '/api/readiness';
  const headers = { 'x-mojian-desktop': 'mojian-test-capability' };
  for (const requestHeaders of [{}, { ...headers, Origin: 'null' }, { ...headers, Origin: 'https://foreign.example' },
    { 'x-mojian-desktop': 'wrong' }]) {
    assert.equal((await fetch(endpoint, { headers: requestHeaders })).status, 403);
  }
  const wrongHost = await new Promise((resolve, reject) => {
    const req = request(endpoint, { headers: { ...headers, Host: 'foreign.example' } }, (res) => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end();
  });
  assert.equal(wrongHost, 403);
  assert.equal(reads, 0, 'untrusted requests cannot probe the host or settings');
  const response = await fetch(endpoint, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).bridgeAvailable, true);
  assert.equal(reads, 1);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  assert.equal(reads, 1);
  assert.equal((await fetch(bridge.url + '/api/settings', { headers })).status, 403);
});
