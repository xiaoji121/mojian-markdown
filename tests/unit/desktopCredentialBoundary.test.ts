import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeDesktopRequest, desktopRequestHeaders, invokeSettings } from '../../desktop/credentialBoundary.js';

const origin = 'http://127.0.0.1:43123';
const token = 'test-only-random-capability';
const request = (headers = {}, method = 'GET') => ({ method, headers: { host: '127.0.0.1:43123', 'x-mojian-desktop': token, ...headers } });
test('desktop API capability rejects foreign/null origins, DNS rebinding, and simple form requests', () => {
  assert.equal(authorizeDesktopRequest(request(), origin, token), true);
  for (const headers of [{ 'x-mojian-desktop': '' }, { 'x-mojian-desktop': 'wrong' }, { origin: 'null' }, { origin: 'https://evil.example' }, { host: 'evil.example:43123' }]) {
    assert.equal(authorizeDesktopRequest(request(headers), origin, token), false);
  }
  assert.equal(authorizeDesktopRequest(request({}, 'DELETE'), origin, token), true);
  assert.equal(authorizeDesktopRequest(request({ 'content-length': '1' }, 'DELETE'), origin, token), false);
  assert.equal(authorizeDesktopRequest(request({}, 'POST'), origin, token), false);
  assert.equal(authorizeDesktopRequest(request({ 'content-type': 'text/plain' }, 'POST'), origin, token), false);
  assert.equal(authorizeDesktopRequest(request({ origin, 'content-type': 'application/json' }, 'POST'), origin, token), true);
});
test('capability is injected only for exact trusted app main frame and is stripped elsewhere', () => {
  const frame = { url: origin + '/#editor' };
  const window = { webContents: { id: 7, mainFrame: frame } };
  const details = { url: origin + '/api/chat', webContentsId: 7, frame, requestHeaders: {} };
  assert.equal(desktopRequestHeaders(details, window, origin, token)['x-mojian-desktop'], token);
  for (const delta of [{ frame: { url: frame.url } }, { webContentsId: 9 }, { url: 'https://evil.example/api/chat' }]) {
    assert.equal(desktopRequestHeaders({ ...details, ...delta, requestHeaders: { 'X-Mojian-Desktop': token } }, window, origin, token)['X-Mojian-Desktop'], undefined);
  }
});
test('settings IPC validates sender, narrowly dispatches operations, and never returns thrown secrets', async () => {
  const frame = { url: origin + '/' };
  const window = { webContents: { mainFrame: frame } };
  const event = { sender: window.webContents, senderFrame: frame };
  const store = { status: async () => ({ providers: {} }), updateProviders: async () => { throw new Error('FAKE-SECRET'); } };
  assert.deepEqual(await invokeSettings(event, window, origin, store, 'load'), { ok: true, value: { providers: {} } });
  assert.equal((await invokeSettings({}, window, origin, store, 'load')).ok, false);
  assert.equal((await invokeSettings(event, window, origin, store, 'decrypt')).ok, false);
  const failed = await invokeSettings(event, window, origin, store, 'save', {});
  assert.equal(failed.ok, false);
  assert.ok(!JSON.stringify(failed).includes('FAKE-SECRET'));
});
