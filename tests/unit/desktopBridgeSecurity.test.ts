import { allowOnlyLoopbackConnections } from '../helpers/loopbackNetwork.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAgentBridge } from '../../scripts/agent-bridge.js';

allowOnlyLoopbackConnections();

async function withBridge(options, run) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-test-'));
  const bridge = await startAgentBridge({ port: 0, root, ...options });
  try {
    await run(bridge);
  } finally {
    await bridge.close();
    await rm(root, { recursive: true, force: true });
  }
}

test('desktop capability protects credential-consuming APIs and HTTP settings stay disabled', async () => {
  await withBridge({ cors: false, desktopCapability: 'fake-test-capability' }, async (bridge) => {
    for (const path of ['/api/settings', '/api/settings/test', '/api/chat', '/api/translate', '/api/compose']) {
      const response = await fetch(bridge.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 403, path);
    }
    const headers = { 'x-mojian-desktop': 'fake-test-capability', 'Content-Type': 'application/json' };
    assert.equal((await fetch(bridge.url + '/api/settings', { headers })).status, 403);
    assert.equal((await fetch(bridge.url + '/api/documents', { headers })).status, 200);
    for (const extra of [{ Origin: 'null' }, { Origin: 'https://foreign.example' }]) {
      assert.equal((await fetch(bridge.url + '/api/documents', { headers: { ...headers, ...extra } })).status, 403);
    }
    assert.equal((await fetch(bridge.url + '/api/chat', { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' })).status, 403);
  });
});

test('desktop authenticated bodyless DELETE remains usable', async () => {
  await withBridge({ cors: false, desktopCapability: 'fake-test-capability' }, async (bridge) => {
    const headers = { 'x-mojian-desktop': 'fake-test-capability', 'Content-Type': 'application/json' };
    const created = await (await fetch(bridge.url + '/api/documents', {
      method: 'POST', headers, body: JSON.stringify({ document: { fileName: 'test.md', content: '# test' } })
    })).json();
    const result = await fetch(bridge.url + '/api/documents/' + created.documentId, {
      method: 'DELETE', headers: { 'x-mojian-desktop': 'fake-test-capability' }
    });
    assert.equal(result.status, 200);
  });
});
