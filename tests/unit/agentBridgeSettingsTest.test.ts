import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { startAgentBridge } from '../../scripts/agent-bridge.js';
import { allowOnlyLoopbackConnections } from '../helpers/loopbackNetwork.ts';

allowOnlyLoopbackConnections();

function requestJson(url, body = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve(JSON.parse(text)));
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
}

test('standalone Gemini settings test aborts its provider operation when the deadline expires', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mojian-test-settings-timeout-'));
  const previousEnv = process.env;
  const originalSetTimeout = globalThis.setTimeout;
  let observedSignal;
  let rejectProvider;
  let providerCalls = 0;
  const bridge = await startAgentBridge({ port: 0, root, settingsStore: {
    providerSettings: async () => ({ apiKey: 'mojian-test-fake-key', model: 'gemini-mojian-test', proxy: '' })
  } });
  // All engine configuration is fabricated; provider traffic never reaches a socket.
  process.env = { AGENT_BRIDGE_GEMINI_BASE: 'http://127.0.0.1:1' };
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) =>
    originalSetTimeout(callback, delay === 15000 ? 25 : delay, ...args));
  t.mock.method(globalThis, 'fetch', (_url, options) => {
    providerCalls++;
    observedSignal = options.signal;
    return new Promise((_resolve, reject) => {
      rejectProvider = reject;
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  });
  try {
    const result = await requestJson(bridge.url + '/api/settings/test');
    assert.equal(result.ok, false);
    assert.match(result.message, /超时/);
    assert.equal(providerCalls, 1);
    assert.equal(observedSignal.aborted, true, 'a UI deadline must also abort the outstanding provider request');
    assert.equal(JSON.stringify(result).includes('mojian-test-fake-key'), false);
  } finally {
    rejectProvider?.(new Error('fixture cleanup'));
    t.mock.restoreAll();
    process.env = previousEnv;
    await bridge.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('standalone Gemini settings test uses the saved proxy instead of unsaved form changes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'mojian-test-settings-proxy-'));
  const previousEnv = process.env;
  const bridge = await startAgentBridge({ port: 0, root, settingsStore: {
    providerSettings: async () => ({ apiKey: 'mojian-test-fake-key', model: 'gemini-mojian-test', proxy: '' })
  } });
  process.env = { AGENT_BRIDGE_GEMINI_BASE: 'http://127.0.0.1:1' };
  let providerCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    providerCalls++;
    return new Response('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) + '\n\n', {
      headers: { 'Content-Type': 'text/event-stream' }
    });
  });
  try {
    const result = await requestJson(bridge.url + '/api/settings/test', { gemini: { proxy: 'mojian-test-unsaved-proxy' } });
    assert.equal(result.ok, true);
    assert.equal(providerCalls, 1);
  } finally {
    t.mock.restoreAll(); process.env = previousEnv;
    await bridge.close(); await rm(root, { recursive: true, force: true });
  }
});
