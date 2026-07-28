import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAgentBridge } from '../../scripts/agent-bridge.js';

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

test('startAgentBridge 在随机端口启动并响应 /health', async () => {
  await withBridge({}, async (bridge) => {
    assert.ok(bridge.port > 0);
    assert.equal(bridge.url, `http://127.0.0.1:${bridge.port}`);
    const response = await fetch(`${bridge.url}/health`);
    assert.equal(response.ok, true);
    assert.deepEqual(await response.json(), { ok: true });
  });
});

test('文档 API 在嵌入模式下可用', async () => {
  await withBridge({}, async (bridge) => {
    const created = await fetch(`${bridge.url}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { fileName: 'note.md', content: '# hi' } })
    });
    assert.equal(created.ok, true);
    const { documentId } = await created.json();
    assert.ok(documentId);
    const listed = await fetch(`${bridge.url}/api/documents`);
    const { documents } = await listed.json();
    assert.equal(documents.length, 1);
    assert.equal(documents[0].fileName, 'note.md');
  });
});

test('DELETE /api/documents/:id 删除文档', async () => {
  await withBridge({}, async (bridge) => {
    const created = await fetch(`${bridge.url}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { fileName: 'note.md', content: '# hi' } })
    });
    const { documentId } = await created.json();

    const deleted = await fetch(`${bridge.url}/api/documents/${documentId}`, { method: 'DELETE' });
    assert.equal(deleted.ok, true);
    assert.deepEqual(await deleted.json(), { ok: true });

    const { documents } = await (await fetch(`${bridge.url}/api/documents`)).json();
    assert.equal(documents.length, 0);
  });
});

test('默认发送 CORS 头，cors:false 时不发送', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/health`);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  });
  await withBridge({ cors: false }, async (bridge) => {
    const response = await fetch(`${bridge.url}/health`);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});

test('staticDir 提供前端静态文件且根路径回落到 index.html', async () => {
  const staticDir = await mkdtemp(join(tmpdir(), 'bridge-static-'));
  await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>墨笺</title>');
  await mkdir(join(staticDir, 'assets'));
  await writeFile(join(staticDir, 'assets', 'app.js'), 'console.log(1)');
  try {
    await withBridge({ staticDir }, async (bridge) => {
      const home = await fetch(`${bridge.url}/`);
      assert.equal(home.status, 200);
      assert.match(home.headers.get('content-type') || '', /text\/html/);
      assert.match(await home.text(), /墨笺/);

      const script = await fetch(`${bridge.url}/assets/app.js`);
      assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type') || '', /javascript/);

      const missing = await fetch(`${bridge.url}/assets/nope.js`);
      assert.equal(missing.status, 404);
    });
  } finally {
    await rm(staticDir, { recursive: true, force: true });
  }
});

test('staticDir 拒绝路径穿越', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'bridge-escape-'));
  const staticDir = join(parent, 'public');
  await mkdir(staticDir);
  await writeFile(join(staticDir, 'index.html'), 'ok');
  await writeFile(join(parent, 'secret.txt'), 'secret');
  try {
    await withBridge({ staticDir }, async (bridge) => {
      const escaped = await fetch(`${bridge.url}/..%2Fsecret.txt`);
      assert.equal(escaped.status, 404);
    });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('未配置 staticDir 时非 API 路径返回 404', async () => {
  await withBridge({}, async (bridge) => {
    const response = await fetch(`${bridge.url}/index.html`);
    assert.equal(response.status, 404);
  });
});
