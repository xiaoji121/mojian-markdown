import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalFileSyncMethods } from '../../src/editor/localFileSyncMethods.ts';
import { createRef, createSourceStub } from '../helpers/dom.ts';

// File System Access API 文件句柄替身：state 模拟磁盘上的真实文件。
function createFakeHandle(content = '', lastModified = 1000) {
  const state = { content, lastModified, written: [] as string[], permission: 'granted' };
  return {
    state,
    name: 'note.md',
    kind: 'file',
    async getFile() {
      const snapshot = state.content;
      return { name: 'note.md', lastModified: state.lastModified, text: async () => snapshot };
    },
    async createWritable() {
      let buffer = '';
      return {
        async write(data: string) { buffer = data; },
        async close() {
          state.content = buffer;
          state.lastModified += 1;
          state.written.push(buffer);
        }
      };
    },
    async queryPermission() { return state.permission; },
    async requestPermission() { return state.permission; }
  };
}

function createEditor(handle: ReturnType<typeof createFakeHandle> | null, value: string) {
  const editor = Object.create(LocalFileSyncMethods.prototype);
  return Object.assign(editor, {
    fileHandle: handle,
    fileName: 'note.md',
    dirty: false,
    sourceRef: createRef(createSourceStub(value)),
    statuses: [] as string[],
    persisted: 0,
    _localFileModifiedAt: 1000,
    _localWriteBusy: false,
    _localFileConflict: false,
    _cleanOpenedMarkdown: (text: string) => String(text),
    _setStatus(msg: string) { this.statuses.push(msg); },
    _setDirty(d: boolean) { this.dirty = d; },
    _persist() { this.persisted += 1; },
    _renderPreview() {},
    _renderComments() {},
    _updateCount() {},
    _resetEditingHistory() {}
  });
}

test('桌面端重启后按工作区路径重建句柄，磁盘最新内容同步进编辑器', async () => {
  // node 环境无 indexedDB，loadFileHandle 自然返回 null，正好模拟重启后句柄丢失。
  (globalThis as { window?: unknown }).window = {
    mojianDesktop: {
      statFile: async (path: string) => (path === '/tmp/note.md' ? { lastModified: 2000 } : null),
      readFile: async (path: string) => (path === '/tmp/note.md' ? { content: '# 磁盘上的新内容', lastModified: 2000 } : null)
    }
  };
  try {
    const editor = createEditor(null, '# 工作区旧副本');
    let watcherStarted = 0;
    editor._startLocalFileWatcher = () => { watcherStarted += 1; };

    await editor._reattachLocalFileForDocument({ fileName: 'note.md', localPath: '/tmp/note.md' });

    assert.ok(editor.fileHandle, '应按路径重建句柄');
    assert.equal((editor.fileHandle as { desktopPath?: string }).desktopPath, '/tmp/note.md');
    assert.equal(editor.sourceRef.current!.value, '# 磁盘上的新内容');
    assert.equal(editor.localFilePath, '/tmp/note.md');
    assert.equal(watcherStarted, 1);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('非桌面端或工作区无路径时不做句柄重建', async () => {
  const editor = createEditor(null, '# 原内容');
  let watcherStarted = 0;
  editor._startLocalFileWatcher = () => { watcherStarted += 1; };

  // 无 window.mojianDesktop（网页版）
  await editor._reattachLocalFileForDocument({ fileName: 'note.md', localPath: '/tmp/note.md' });
  assert.equal(editor.fileHandle, null);

  // 桌面端但工作区没记录路径
  (globalThis as { window?: unknown }).window = { mojianDesktop: { statFile: async () => null, readFile: async () => null } };
  try {
    await editor._reattachLocalFileForDocument({ fileName: 'note.md' });
    assert.equal(editor.fileHandle, null);
    assert.equal(editor.sourceRef.current!.value, '# 原内容');
    assert.equal(watcherStarted, 0);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('编辑后自动写回本地文件并清除脏标记', async () => {
  const handle = createFakeHandle('旧内容', 1000);
  const editor = createEditor(handle, '编辑后的内容');
  editor.dirty = true;

  await editor._maybeWriteThroughLocalFile();

  assert.deepEqual(handle.state.written, ['编辑后的内容']);
  assert.equal(editor.dirty, false);
  assert.equal(editor._localFileModifiedAt, handle.state.lastModified);
});

test('没有写权限时不写回，保留脏标记等待手动保存', async () => {
  const handle = createFakeHandle('旧内容', 1000);
  handle.state.permission = 'prompt';
  const editor = createEditor(handle, '编辑后的内容');
  editor.dirty = true;

  await editor._maybeWriteThroughLocalFile();

  assert.deepEqual(handle.state.written, []);
  assert.equal(editor.dirty, true);
});

test('本地文件被外部修改且编辑器没有未保存改动时自动重载', async () => {
  const handle = createFakeHandle('外部程序写入的新内容', 3000);
  const editor = createEditor(handle, '旧内容');

  await editor._checkLocalFileChange();

  assert.equal(editor.sourceRef.current.value, '外部程序写入的新内容');
  assert.equal(editor._localFileModifiedAt, 3000);
  assert.equal(editor.dirty, false);
  assert.equal(editor.persisted, 1);
});

test('外部修改与未保存编辑冲突时标记冲突，不覆盖编辑内容', async () => {
  const handle = createFakeHandle('外部程序写入的新内容', 3000);
  const editor = createEditor(handle, '本地未保存的编辑');
  editor.dirty = true;

  await editor._checkLocalFileChange();

  assert.equal(editor.sourceRef.current.value, '本地未保存的编辑');
  assert.equal(editor._localFileConflict, true);
  assert.ok(editor.statuses.some((msg: string) => msg.includes('修改')));
});

test('冲突状态下暂停自动写回，避免静默覆盖外部改动', async () => {
  const handle = createFakeHandle('外部内容', 1000);
  const editor = createEditor(handle, '编辑内容');
  editor.dirty = true;
  editor._localFileConflict = true;

  await editor._maybeWriteThroughLocalFile();

  assert.deepEqual(handle.state.written, []);
});

test('写回前发现文件已被外部更新时转入冲突流程', async () => {
  const handle = createFakeHandle('外部程序写入的新内容', 2000);
  const editor = createEditor(handle, '编辑内容');
  editor.dirty = true;
  editor._localFileModifiedAt = 1000;

  await editor._maybeWriteThroughLocalFile();

  assert.deepEqual(handle.state.written, []);
  assert.equal(editor._localFileConflict, true);
});

test('文件位于已关联文件夹内时解析出相对路径', async () => {
  const handle = createFakeHandle('内容', 1000);
  const editor = createEditor(handle, '内容');
  editor._folderHandles = [
    { name: '别的文件夹', handle: { resolve: async () => null } },
    { name: '我的笔记', handle: { resolve: async (h: unknown) => (h === handle ? ['阅读', 'note.md'] : null) } }
  ];

  assert.equal(await editor._resolveLocalFilePath(handle), '我的笔记/阅读/note.md');
});

test('不在任何关联文件夹内时路径为空', async () => {
  const handle = createFakeHandle('内容', 1000);
  const editor = createEditor(handle, '内容');
  editor._folderHandles = [{ name: '我的笔记', handle: { resolve: async () => null } }];

  assert.equal(await editor._resolveLocalFilePath(handle), null);
});

test('接上本地文件时解析并记下相对路径', async () => {
  const handle = createFakeHandle('内容', 1000);
  const editor = createEditor(handle, '内容');
  editor._startLocalFileWatcher = () => {};
  editor._folderHandles = [{ name: '我的笔记', handle: { resolve: async () => ['note.md'] } }];

  await editor._attachLocalFile(handle);

  assert.equal(editor.localFilePath, '我的笔记/note.md');
});

test('文件内容与编辑器一致时仅更新基线，不打扰用户', async () => {
  const handle = createFakeHandle('相同内容', 5000);
  const editor = createEditor(handle, '相同内容');
  editor._localFileConflict = true;

  await editor._checkLocalFileChange();

  assert.equal(editor._localFileModifiedAt, 5000);
  assert.equal(editor._localFileConflict, false);
  assert.equal(editor.persisted, 0);
});

test('本地自动同步失败时明确提示并保留未保存状态', async () => {
  const handle = createFakeHandle('old');
  handle.createWritable = async () => { throw new Error('disk unavailable'); };
  const editor = createEditor(handle, 'new');
  editor.dirty = true;
  await editor._maybeWriteThroughLocalFile();
  assert.match(editor.statuses.at(-1), /本地文件同步失败/);
  assert.equal(editor.dirty, true);
});
