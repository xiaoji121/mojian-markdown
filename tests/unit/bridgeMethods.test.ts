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

function findByClass(
  el: { className?: string; children?: unknown[] },
  cls: string
): { className?: string; dispatch?: (type: string) => void } | null {
  if (el.className === cls) return el;
  for (const child of el.children || []) {
    const found = findByClass(child as typeof el, cls);
    if (found) return found;
  }
  return null;
}

test('悬停本地路径时显示完整路径浮层，移开后隐藏', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const body = createStubElement();
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement(), body },
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
        documentId: 'doc-1', fileName: 'note.md', localPath: '/Users/me/writing/drafts/note.md',
        updatedAt: '2026-07-25T08:00:00.000Z', annotationCount: 0, questionCount: 0, answerDocuments: []
      }],
      openRecentDocument() {},
      openAnswerDocument() {}
    });
    editor._renderRecentDocuments();

    const path = findByClass(list, 'recent-document-path');
    assert.ok(path, '路径元素应该渲染');
    path!.dispatch!('mouseenter');

    const tip = body.children[0] as ReturnType<typeof createStubElement>;
    assert.ok(tip, '浮层应挂到 document.body');
    assert.equal(tip.textContent, '/Users/me/writing/drafts/note.md');
    assert.ok(tip.classList.contains('is-visible'));

    path!.dispatch!('mouseleave');
    assert.equal(tip.classList.contains('is-visible'), false);

    // 重新渲染（如切换文档）后浮层保持隐藏，不会悬空残留
    path!.dispatch!('mouseenter');
    editor._renderRecentDocuments();
    assert.equal(tip.classList.contains('is-visible'), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as Record<string, unknown>).document;
  }
});

test('列表项带删除按钮，点击按钮触发删除而不打开文档', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement(), body: createStubElement() },
    configurable: true
  });
  try {
    const list = createStubElement();
    const editor = Object.create(BridgeMethods.prototype);
    let opened = 0;
    const deleted: unknown[] = [];
    Object.assign(editor, {
      documentListRef: { current: list },
      documentCountRef: { current: createStubElement() },
      bridgeDocumentId: null,
      activeAnswerRequestId: null,
      recentDocuments: [{
        documentId: 'doc-1', fileName: 'note.md',
        updatedAt: '2026-07-25T08:00:00.000Z', annotationCount: 0, questionCount: 0, answerDocuments: []
      }],
      openRecentDocument() { opened += 1; },
      openAnswerDocument() {},
      deleteRecentDocument(doc: unknown) { deleted.push(doc); }
    });
    editor._renderRecentDocuments();

    const remove = findByClass(list, 'recent-document-delete');
    assert.ok(remove, '删除按钮应该渲染');
    remove!.dispatch!('click');

    assert.equal(deleted.length, 1);
    assert.equal((deleted[0] as { documentId: string }).documentId, 'doc-1');
    assert.equal(opened, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as Record<string, unknown>).document;
  }
});

test('确认删除后调用 DELETE 接口、清除当前关联并刷新列表', async () => {
  const requests: Array<[string, string]> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    requests.push([String(input), init?.method || 'GET']);
    return { ok: true, json: async () => ({}) };
  }) as typeof fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { confirm: () => true }, configurable: true });
  try {
    const editor = createEditor();
    editor.bridgeDocumentId = 'doc-1';
    editor.activeDocumentId = 'doc-1';
    editor.previewOverrideMarkdown = '# 答案';
    editor.activeAnswerRequestId = 'q-1';
    let refreshed = 0;
    let previewRendered = 0;
    editor._refreshRecentDocuments = async () => { refreshed += 1; };
    editor._renderPreview = () => { previewRendered += 1; };
    editor._setStatus = () => {};

    await editor.deleteRecentDocument({ documentId: 'doc-1', fileName: 'note.md' });

    assert.deepEqual(requests, [['http://127.0.0.1:4317/api/documents/doc-1', 'DELETE']]);
    assert.equal(editor.bridgeDocumentId, null);
    assert.equal(editor.activeDocumentId, null);
    assert.equal(editor.previewOverrideMarkdown, '');
    assert.equal(editor.activeAnswerRequestId, null);
    assert.equal(previewRendered, 1);
    assert.equal(refreshed, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as Record<string, unknown>).window;
  }
});

test('用户取消确认时不发起删除请求', async () => {
  let fetchCount = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => { fetchCount += 1; return { ok: true, json: async () => ({}) }; }) as typeof fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { confirm: () => false }, configurable: true });
  try {
    const editor = createEditor();
    editor._setStatus = () => {};

    await editor.deleteRecentDocument({ documentId: 'doc-1', fileName: 'note.md' });

    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as Record<string, unknown>).window;
  }
});

test('初始为示例文档且有最近阅读时，自动打开最近更新的一篇', async () => {
  const editor = createEditor();
  editor._startedWithSample = true;
  editor.dirty = false;
  editor.fileHandle = null;
  editor.fileName = '未命名.md';
  editor.recentDocuments = [
    { documentId: 'doc-old', fileName: 'a.md', updatedAt: '2026-07-20T00:00:00.000Z' },
    { documentId: 'doc-new', fileName: 'b.md', updatedAt: '2026-07-27T00:00:00.000Z' }
  ];
  const opened: string[] = [];
  editor.openRecentDocument = async (id: string) => { opened.push(id); editor.fileName = 'b.md'; };
  editor._setStatus = () => {};

  await editor._maybeOpenLatestRecentDocument();

  assert.deepEqual(opened, ['doc-new']);
  assert.equal(editor._startedWithSample, false);
});

test('有草稿、已编辑、已开文件或列表为空时，不覆盖当前内容', async () => {
  const scenarios = [
    { _startedWithSample: false },
    { dirty: true },
    { fileHandle: {} },
    { fileName: 'note.md' },
    { recentDocuments: [] }
  ];
  for (const overrides of scenarios) {
    const editor = createEditor();
    editor._startedWithSample = true;
    editor.dirty = false;
    editor.fileHandle = null;
    editor.fileName = '未命名.md';
    editor.recentDocuments = [
      { documentId: 'doc-1', fileName: 'a.md', updatedAt: '2026-07-20T00:00:00.000Z' }
    ];
    Object.assign(editor, overrides);
    const opened: string[] = [];
    editor.openRecentDocument = async (id: string) => { opened.push(id); };
    editor._setStatus = () => {};

    await editor._maybeOpenLatestRecentDocument();

    assert.equal(opened.length, 0, '不应打开：' + JSON.stringify(overrides));
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
