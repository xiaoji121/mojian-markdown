import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesktopFileHandle,
  fromStorable,
  toStorable
} from '../../src/editor/desktopFileHandle.ts';

function installDesktopApi() {
  const calls: Record<string, unknown[][]> = { readFile: [], writeFile: [], statFile: [] };
  const files = new Map<string, { content: string; lastModified: number }>();
  (globalThis as { window?: unknown }).window = {
    mojianDesktop: {
      statFile: async (path: string) => {
        calls.statFile.push([path]);
        const file = files.get(path);
        return file ? { lastModified: file.lastModified } : null;
      },
      readFile: async (path: string) => {
        calls.readFile.push([path]);
        const file = files.get(path);
        return file ? { content: file.content, lastModified: file.lastModified } : null;
      },
      writeFile: async (path: string, content: string) => {
        calls.writeFile.push([path, content]);
        files.set(path, { content, lastModified: Date.now() });
        return { lastModified: files.get(path)!.lastModified };
      }
    }
  };
  return { calls, files };
}

let env: ReturnType<typeof installDesktopApi>;
beforeEach(() => { env = installDesktopApi(); });
afterEach(() => { delete (globalThis as { window?: unknown }).window; });

test('getFile 只查 stat，text() 才读正文', async () => {
  env.files.set('/tmp/a.md', { content: '# hi', lastModified: 42 });
  const handle = createDesktopFileHandle('/tmp/a.md', 'a.md');
  const file = await handle.getFile();
  assert.equal(file.lastModified, 42);
  assert.equal(file.name, 'a.md');
  assert.equal(env.calls.readFile.length, 0);
  assert.equal(await file.text(), '# hi');
  assert.equal(env.calls.readFile.length, 1);
});

test('createWritable 缓冲写入，close 时落盘', async () => {
  const handle = createDesktopFileHandle('/tmp/b.md', 'b.md');
  const writable = await handle.createWritable();
  await writable.write('新内容');
  assert.equal(env.calls.writeFile.length, 0);
  await writable.close();
  assert.deepEqual(env.calls.writeFile, [['/tmp/b.md', '新内容']]);
});

test('权限查询恒为 granted，句柄携带 desktopPath 与 kind', async () => {
  const handle = createDesktopFileHandle('/tmp/c.md', 'c.md');
  assert.equal(await handle.queryPermission(), 'granted');
  assert.equal(await handle.requestPermission(), 'granted');
  assert.equal(handle.desktopPath, '/tmp/c.md');
  assert.equal(handle.kind, 'file');
});

test('toStorable 把桌面句柄降为纯标记，其余原样返回', () => {
  const handle = createDesktopFileHandle('/tmp/d.md', 'd.md');
  assert.deepEqual(toStorable(handle), { desktopPath: '/tmp/d.md', name: 'd.md' });
  const browserHandle = { kind: 'file', name: 'x.md' };
  assert.equal(toStorable(browserHandle), browserHandle);
});

test('fromStorable 在桌面环境复原句柄，非桌面环境返回 null', async () => {
  env.files.set('/tmp/e.md', { content: 'e', lastModified: 7 });
  const revived = fromStorable({ desktopPath: '/tmp/e.md', name: 'e.md' }) as
    ReturnType<typeof createDesktopFileHandle>;
  assert.equal(revived.desktopPath, '/tmp/e.md');
  assert.equal((await revived.getFile()).lastModified, 7);

  delete (globalThis as { window?: unknown }).window;
  assert.equal(fromStorable({ desktopPath: '/tmp/e.md', name: 'e.md' }), null);

  const browserHandle = { kind: 'file' };
  assert.equal(fromStorable(browserHandle), browserHandle);
});
