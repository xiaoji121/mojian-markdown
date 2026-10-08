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

for (const change of ['edit', 'empty', 'rename', 'file', 'newer-open']) {
  test(`slow initial restore cannot overwrite ${change}`, async () => {
    const original = globalThis.fetch;
    const started = deferred(), finish = deferred();
    globalThis.fetch = (async () => {
      started.resolve(); await finish.promise;
      return { ok: true, json: async () => ({ document: {
        documentId: 'doc-1', fileName: 'old.md', content: '# Old', annotations: [], messages: []
      } }) };
    }) as typeof fetch;
    try {
      const editor = editorForRestore(async () => {});
      editor.sourceRef.current.value = '# Sample';
      const pending = editor._maybeOpenLatestRecentDocument();
      await started.promise;
      if (change === 'edit') { editor.sourceRef.current.value = '# My edit'; editor.dirty = true; }
      if (change === 'empty') editor.sourceRef.current.value = '';
      if (change === 'rename') editor.fileName = 'mine.md';
      if (change === 'file') editor.fileHandle = {};
      if (change === 'newer-open') editor._documentOpenGeneration++;
      const content = editor.sourceRef.current.value;
      finish.resolve(); await pending;
      assert.equal(editor.sourceRef.current.value, content);
      assert.notEqual(editor.fileName, 'old.md');
      assert.equal(editor.status, '');
    } finally { globalThis.fetch = original; }
  });
}

test('localized initial filename still permits recent document recovery', async () => {
  await withDocumentFetch(true, async () => {
    const editor = editorForRestore(async () => {});
    editor.fileName = 'Untitled.md';
    editor._initialSample = { fileName: 'Untitled.md', markdown: '# Sample' };
    editor.sourceRef.current.value = '# Sample';
    await editor._maybeOpenLatestRecentDocument();
    assert.equal(editor.sourceRef.current.value, '# Restored');
  });
});

test('same-name localized sample never adopts a workspace record before restoring it', async () => {
  const original = globalThis.fetch;
  const doc = { documentId: 'doc-1', fileName: 'Untitled.md', content: '# Existing work', updatedAt: '2026-10-08' };
  globalThis.fetch = (async (url) => ({ ok: true, json: async () => String(url).endsWith('/api/documents')
    ? { documents: [doc] } : { document: doc } })) as typeof fetch;
  try {
    const editor = editorForRestore(async () => {});
    editor.fileName = 'Untitled.md';
    editor._initialSample = { fileName: 'Untitled.md', markdown: '# Sample' };
    editor.sourceRef.current.value = '# Sample';
    await editor._refreshRecentDocuments();
    assert.equal(editor.bridgeDocumentId, null, 'sample must not be linked to existing user work');
    await editor._maybeOpenLatestRecentDocument();
    assert.equal(editor.sourceRef.current.value, '# Existing work');
  } finally { globalThis.fetch = original; }
});
