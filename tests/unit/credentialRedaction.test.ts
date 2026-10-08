import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialOutput } from '../../scripts/agent-bridge-credential-output.js';

test('provider output cannot return an exact key even split across stream chunks', () => {
  const key = 'FAKE-secret-only';
  const deltas: string[] = [];
  const output = credentialOutput(key, (part) => deltas.push(part));
  for (const part of ['before FAKE-', 'secret-', 'only after']) output.delta(part);
  output.flush();
  assert.equal(deltas.join(''), 'before [redacted] after');
  assert.ok(!output.text('failed ' + key).includes(key));
});
