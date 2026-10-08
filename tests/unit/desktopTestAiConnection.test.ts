import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runEngine } from '../../scripts/agent-bridge-engines.js';
import { allowOnlyLoopbackConnections } from '../helpers/loopbackNetwork.ts';
import { testAiConnection } from '../../desktop/testAiConnection.js';

allowOnlyLoopbackConnections();

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

test('Gemini test uses the saved proxy even when a different proxy is typed', async () => {
  const store = { providerSettings: async () => ({ apiKey: 'FAKE-key', model: 'gemini-test', proxy: 'http://127.0.0.1:7890' }) };
  const result = await testAiConnection(store, { gemini: { proxy: 'http://127.0.0.1:8888' } },
    async (engine, _prompt, _delta, _env, options) => {
      assert.equal(engine, 'gemini');
      assert.equal(options.gemini.proxy, 'http://127.0.0.1:7890');
    });
  assert.deepEqual(result, { ok: true });
});

test('timeout is reported without returning the provider error or fake secret', async () => {
  const store = { providerSettings: async () => ({ apiKey: 'FAKE-secret', model: 'gemini-test', proxy: '' }) };
  const result = await testAiConnection(store, {}, async () => {
    throw Object.assign(new Error('FAKE-secret'), { code: 'ETIMEDOUT' });
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /超时/);
  assert.ok(!JSON.stringify(result).includes('FAKE-secret'));
});


for (const phase of ['headers', 'body']) {
  test(`desktop Gemini timeout actually aborts a hanging ${phase} request`, { timeout: 10000 }, async () => {
    let reachedProvider = false;
    let closed;
    const connectionClosed = new Promise<void>(resolve => { closed = resolve; });
    const server = createServer((req, res) => {
      reachedProvider = true;
      assert.equal(req.headers['x-goog-api-key'], 'FAKE-timeout-only');
      res.once('close', closed);
      req.resume();
      if (phase === 'body') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(': waiting for provider response\n\n');
      }
      // Deliberately never send a response/end the stream.
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    const store = { providerSettings: async () => ({ apiKey: 'FAKE-timeout-only', model: 'gemini-test', proxy: '' }) };
    let closeTimer;
    try {
      const result = await testAiConnection(store, {}, (engine, prompt, delta, _env, options) => {
        assert.equal(options.timeoutMs, 15000, 'production test budget remains 15 seconds');
        // Exercise the real fetch/stream AbortController path with a shortened
        // test budget and an isolated environment; never inherit proxy or keys.
        return runEngine(engine, prompt, delta, { AGENT_BRIDGE_GEMINI_BASE: `http://127.0.0.1:${port}` },
          { ...options, timeoutMs: 500 });
      });
      assert.equal(reachedProvider, true);
      assert.equal(result.ok, false);
      assert.match(result.message, /超时/);
      assert.ok(!JSON.stringify(result).includes('FAKE-timeout-only'));
      await Promise.race([
        connectionClosed,
        new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new Error('Underlying provider socket remained open')), 1000); })
      ]);
    } finally {
      clearTimeout(closeTimer);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
