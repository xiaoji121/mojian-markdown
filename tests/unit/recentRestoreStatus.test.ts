import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeMethods } from '../../src/editor/bridgeMethods.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function editorForRestore(reattach: () => Promise<void>) {
  const editor = Object.create(BridgeMethods.prototype);
  return Object.assign(editor, {
    _startedWithSample: true, dirty: false, fileHandle: null,
    fileName: '未命名.md', bridgeDocumentId: null,
    recentDocuments: [{ documentId: 'doc-1', updatedAt: '2026-10-08' }],
    sourceRef: { current: { value: '' } }, previewRef: { current: {} },
    _flushBridgeSync: async () => {}, _noteDocumentOpened() {}, _detachLocalFile() {},
    _cleanOpenedMarkdown: (text: string) => text, _resetEditingHistory() {},
    _commentsFromBridge: () => [], _showConversationMessages() {},
    _renderComments() {}, _renderPreview() {}, _setDirty() {}, _persist() {},
    _renderRecentDocuments() {}, closeDocumentSidebar() {}, _hydrateLocalImages() {},
    _setFileName(name: string) { this.fileName = name; },
    status: '', _setStatus(message: string) { this.status = message; },
    _reattachLocalFileForDocument: reattach
  });
}

async function withDocumentFetch(ok: boolean, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok, json: async () => ({ document: {
    documentId: 'doc-1', fileName: 'note.md', content: '# Restored', annotations: [], messages: []
  } }) })) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('late recent restore completion preserves newer copy feedback', async () => {
  await withDocumentFetch(true, async () => {
    const started = deferred(), finish = deferred();
    const editor = editorForRestore(async () => { started.resolve(); await finish.promise; });
    const restoring = editor._maybeOpenLatestRecentDocument();
    await started.promise;
    assert.equal(editor.sourceRef.current.value, '# Restored', 'document is already interactive');
    editor._setStatus('✓ 已复制该批注');
    finish.resolve();
    await restoring;
    assert.equal(editor.status, '✓ 已复制该批注');
  });
});

test('failed automatic restore keeps the read error instead of reporting success', async () => {
  await withDocumentFetch(false, async () => {
    const editor = editorForRestore(async () => {});
    await editor._maybeOpenLatestRecentDocument();
    assert.equal(editor.status, '文档读取失败');
  });
});

test('automatic and manual opens retain their respective success labels', async () => {
  await withDocumentFetch(true, async () => {
    const automatic = editorForRestore(async () => {});
    await automatic._maybeOpenLatestRecentDocument();
    assert.equal(automatic.status, '已恢复最近阅读 · note.md');
    const manual = editorForRestore(async () => {});
    await manual.openRecentDocument('doc-1');
    assert.equal(manual.status, '已从 Reading Workspace 打开 · note.md');
  });
});
