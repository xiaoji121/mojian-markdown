import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowsInstallerEnv, nsisInstallArguments, installerKillArguments, runInstallerCommand } from '../../scripts/installer-smoke.mjs';

test('native installer gets Windows bootstrap paths without host credentials or profiles', () => {
  const app = { HOME: 'isolated', USERPROFILE: 'isolated', APPDATA: 'isolated', LOCALAPPDATA: 'isolated', Path: 'mock-bin;node-bin' };
  const env = windowsInstallerEnv(app, { SystemRoot: 'C:\\Windows', USERNAME: 'runner', USERDOMAIN: 'host',
    ProgramFiles: 'C:\\Program Files', COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
    PATH: 'real-clis', PSModulePath: 'real-profile-modules', HOME: 'real-home', USERPROFILE: 'real-user',
    GITHUB_TOKEN: 'secret', GEMINI_API_KEY: 'secret', NODE_OPTIONS: '--require=untrusted.js' });
  assert.equal(env.USERPROFILE, 'isolated'); assert.equal(env.HOME, 'isolated');
  assert.equal(env.APPDATA, 'isolated'); assert.equal(env.LOCALAPPDATA, 'isolated');
  assert.equal(env.USERNAME, 'runner');
  assert.ok(env.Path.includes('C:\\Windows\\System32'));
  assert.ok(env.Path.includes('C:\\Windows\\System32\\Wbem'));
  assert.ok(env.PSModulePath.includes('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'));
  assert.ok(!JSON.stringify(env).includes('secret'));
  assert.ok(!JSON.stringify(env).includes('real-'));
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.deepEqual(app, { HOME: 'isolated', USERPROFILE: 'isolated', APPDATA: 'isolated', LOCALAPPDATA: 'isolated', Path: 'mock-bin;node-bin' });
});

test('NSIS directory and PID-tree arguments remain exact and shell-free', () => {
  assert.deepEqual(nsisInstallArguments('C:\\temp\\space 中文'), ['/S', '/currentuser', '/D=C:\\temp\\space 中文']);
  assert.deepEqual(installerKillArguments(123), ['/PID', '123', '/T', '/F']);
  for (const value of [0, -1, NaN, '123', '123 /IM *']) assert.throws(() => installerKillArguments(value));
});

test('native command timeout records diagnostics before killing only its child tree', async () => {
  const events: string[] = [];
  const pending = Object.assign(new Promise(() => {}), { child: { pid: 123, exitCode: null, signalCode: null } });
  await assert.rejects(runInstallerCommand('test.exe', ['/S'], { timeout: 10, stage: 'upgrade',
    execute: () => pending, report: event => events.push(event),
    diagnose: async pid => { assert.equal(pid, 123); events.push('diagnose'); },
    stop: async pid => { assert.equal(pid, 123); events.push('stop'); }
  }), /upgrade timed out/);
  assert.ok(events.indexOf('diagnose') < events.indexOf('stop'));
});

test('successful native command does not schedule timeout cleanup', async () => {
  const pending = Object.assign(Promise.resolve({ stdout: 'done' }), { child: { pid: 124, exitCode: 0 } });
  const result = await runInstallerCommand('test.exe', ['/S'], { timeout: 10, stage: 'install',
    execute: () => pending, report: () => {}, diagnose: () => assert.fail(), stop: () => assert.fail() });
  assert.equal(result.stdout, 'done');
});
