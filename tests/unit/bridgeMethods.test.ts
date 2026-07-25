import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeMethods } from '../../src/editor/bridgeMethods.ts';
import { createStubElement } from '../helpers/dom.ts';

// 按路径前缀分发的 fetch 替身；最长的路径先匹配，返回恢复函数。
function installFetchStub(routes: Record<string, unknown>) {
  const previous = globalThis.fetch;
  const entries = Object.entries(routes).sort((a, b) => b[0].length - a[0].length);
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    const match = entries.find(([path]) => url.includes(path));
    if (!match) throw new Error('unexpected fetch: ' + url);
    return { ok: true, json: async () => match[1] };
  }) as typeof fetch;
  return () => { globalThis.fetch = previous; };
}

function createEditor() {
  const editor = Object.create(BridgeMethods.prototype);
  return Object.assign(editor, {
    agentBridgeEnabled: true,
    bridgeDocumentId: null,
    activeDocumentId: null,
    comments: [],
    recentDocuments: [],
    _renderRecentDocuments() {},
    _persist() {}
  });
}

test('打开本地文件时认领 Reading Workspace 里的同名文档', async () => {
  const restore = installFetchStub({
    '/api/documents/doc-1': {
      document: {
        documentId: 'doc-1', fileName: 'note.md', content: 'x',
        annotations: [{ id: 'a1', requestId: 'a1', quote: '原文', type: 'marker', note: '' }],
        messages: []
      }
    },
    '/api/documents': {
      documents: [
        { documentId: 'doc-0', fileName: 'other.md', questionCount: 2 },
        { documentId: 'doc-1', fileName: 'note.md', questionCount: 1 },
        { documentId: 'doc-2', fileName: 'note.md', questionCount: 0 }
      ]
    }
  });
  try {
    const editor = createEditor();

    const doc = await editor._adoptBridgeDocument('note.md');

    assert.equal(doc.documentId, 'doc-1');
    assert.equal(editor.bridgeDocumentId, 'doc-1');
    assert.equal(editor.activeDocumentId, 'doc-1');
    assert.equal(editor.comments.length, 1);
    assert.equal(editor.comments[0].quote, '原文');
  } finally {
    restore();
  }
});

test('工作区没有同名文档时保持新文档状态', async () => {
  const restore = installFetchStub({ '/api/documents': { documents: [] } });
  try {
    const editor = createEditor();

    const doc = await editor._adoptBridgeDocument('note.md');

    assert.equal(doc, null);
    assert.equal(editor.bridgeDocumentId, null);
  } finally {
    restore();
  }
});

test('同步 payload 携带本地相对路径', () => {
  const editor = Object.create(BridgeMethods.prototype);
  Object.assign(editor, {
    sourceRef: { current: { value: '内容' } },
    fileName: 'note.md',
    localFilePath: '我的笔记/note.md',
    bridgeDocumentId: 'doc-1'
  });

  const payload = editor._documentPayload();

  assert.equal(payload.localPath, '我的笔记/note.md');
  assert.equal(payload.documentId, 'doc-1');
});

function collectTexts(el: { textContent?: string; children?: unknown[] }, out: string[] = []) {
  if (el.textContent) out.push(el.textContent);
  (el.children || []).forEach((child) => collectTexts(child as typeof el, out));
  return out;
}

test('最近文档列表展示每篇文档的本地路径', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement() },
    configurable: true
  });
  try {
    const list = createStubElement();
    const editor = Object.create(BridgeMethods.prototype);
    Object.assign(editor, {
      documentListRef: { current: list },
      documentCountRef: { current: createStubElement() },
      bridgeDocumentId: null,
      activeAnswerRequestId: null,
      recentDocuments: [{
        documentId: 'doc-1', fileName: 'note.md', localPath: '我的笔记/阅读/note.md',
        updatedAt: '2026-07-25T08:00:00.000Z', annotationCount: 0, questionCount: 0, answerDocuments: []
      }],
      openRecentDocument() {},
      openAnswerDocument() {}
    });

    editor._renderRecentDocuments();

    assert.ok(collectTexts(list).includes('我的笔记/阅读/note.md'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as Record<string, unknown>).document;
  }
});

test('Bridge 未启用或文件未命名时不发起认领请求', async () => {
  const previous = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (async () => { called += 1; throw new Error('should not fetch'); }) as typeof fetch;
  try {
    const disabled = createEditor();
    disabled.agentBridgeEnabled = false;
    assert.equal(await disabled._adoptBridgeDocument('note.md'), null);

    const unnamed = createEditor();
    assert.equal(await unnamed._adoptBridgeDocument('未命名.md'), null);

    assert.equal(called, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
