import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testAiConnection } from '../../desktop/testAiConnection.js';

test('explicit connection test never returns provider echoes or native errors', async () => {
  const fake = 'FAKE-only-never-valid';
  const store = { providerSettings: async () => ({ apiKey: fake, model: 'gemini-test', proxy: '' }) };
  let calls = 0;
  const engine = async (_engine, _prompt, _delta, _env, options) => {
    calls++;
    assert.equal(options.gemini.apiKey, fake);
    assert.equal(options.timeoutMs, 15000);
    return fake;
  };
  assert.deepEqual(await testAiConnection(store, {}, engine), { ok: true });
  assert.equal(calls, 1);
  const result = await testAiConnection(store, {}, async () => { throw new Error(fake); });
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(fake));
});

test('testing a supplied fake key does not decrypt or migrate an older saved key', async () => {
  let decrypted = false;
  const store = {
    status: async () => ({ providers: { gemini: { model: 'gemini-test', proxy: '' } } }),
    providerSettings: async () => { decrypted = true; throw new Error('must not decrypt'); }
  };
  const result = await testAiConnection(store, { gemini: { apiKey: 'FAKE-new-test-key' } },
    async (_engine, _prompt, _delta, _env, { gemini }) => { assert.equal(gemini.apiKey, 'FAKE-new-test-key'); });
  assert.equal(result.ok, true);
  assert.equal(decrypted, false);
});
