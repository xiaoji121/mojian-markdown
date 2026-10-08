import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { developmentInvocations } from '../../scripts/dev-with-bridge.js';

test('development servers use Node entrypoints instead of npm.cmd or shell commands', async () => {
  const commands = developmentInvocations();
  assert.equal(commands.length, 2);
  for (const invocation of commands) {
    assert.equal(invocation.command, process.execPath);
    assert.ok((await stat(invocation.args[0])).isFile());
  }
  assert.equal(commands[0].label, 'bridge');
  assert.equal(commands[1].label, 'vite');
  assert.deepEqual(commands[1].args.slice(1), ['--mode', 'bridge']);
});
