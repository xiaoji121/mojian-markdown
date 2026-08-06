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

test('当前文档的本地路径展示在底部状态栏，不再挤进列表项', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement() },
    configurable: true
  });
  try {
    const list = createStubElement();
    const footer = createStubElement();
    const editor = Object.create(BridgeMethods.prototype);
    Object.assign(editor, {
      documentListRef: { current: list },
      documentCountRef: { current: createStubElement() },
      footerPathRef: { current: footer },
      bridgeDocumentId: 'doc-1',
      activeAnswerRequestId: null,
      localFilePath: null,
      recentDocuments: [{
        documentId: 'doc-1', fileName: 'note.md', localPath: '我的笔记/阅读/note.md',
        updatedAt: '2026-07-25T08:00:00.000Z', annotationCount: 0, questionCount: 0, answerDocuments: []
      }],
      openRecentDocument() {},
      openAnswerDocument() {}
    });

    editor._renderRecentDocuments();

    assert.equal(footer.textContent, '我的笔记/阅读/note.md', '路径写入底部状态栏');
    assert.ok(footer.classList.contains('has-path'));
    assert.ok(!collectTexts(list).includes('我的笔记/阅读/note.md'), '路径不再出现在列表项里');
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

test('最近文档下渲染「摘录回答」子节点，点击打开对应回答', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement() },
    configurable: true
  });
  try {
    const list = createStubElement();
    const editor = Object.create(BridgeMethods.prototype);
    const openedAnswers: Array<[string, string]> = [];
    Object.assign(editor, {
      documentListRef: { current: list },
      documentCountRef: { current: createStubElement() },
      bridgeDocumentId: null,
      activeAnswerRequestId: null,
      recentDocuments: [{
        documentId: 'doc-1', fileName: 'note.md',
        updatedAt: '2026-07-25T08:00:00.000Z', annotationCount: 2, questionCount: 0,
        answerDocuments: [
          { requestId: 'a1', question: '如何衡量效率？', kind: 'reply', updatedAt: '2026-07-25T08:00:00.000Z' }
        ]
      }],
      _expandedAnswerDocIds: new Set(['doc-1']), // 追问树默认收起，此处展开以校验子节点
      openRecentDocument() {},
      openAnswerDocument(documentId: string, requestId: string) { openedAnswers.push([documentId, requestId]); }
    });

    editor._renderRecentDocuments();

    const texts = collectTexts(list);
    assert.ok(texts.includes('如何衡量效率？'));
    assert.ok(texts.some((text) => text.startsWith('摘录回答 · ')), '子节点应标注为摘录回答：' + JSON.stringify(texts));
    const child = findByClass(list, 'recent-answer-item');
    assert.ok(child, '子节点应该渲染');
    child!.dispatch!('click');
    assert.deepEqual(openedAnswers, [['doc-1', 'a1']]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as Record<string, unknown>).document;
  }
});

function findAllByClass(
  el: { className?: string; children?: unknown[] },
  cls: string,
  out: Array<{ className?: string; children?: unknown[] }> = []
) {
  if (el.className === cls) out.push(el);
  for (const child of el.children || []) findAllByClass(child as typeof el, cls, out);
  return out;
}

test('子文档的子文档在侧栏里递归嵌套展示', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement() },
    configurable: true
  });
  try {
    const list = createStubElement();
    const editor = Object.create(BridgeMethods.prototype);
    const openedAnswers: Array<[string, string]> = [];
    Object.assign(editor, {
      documentListRef: { current: list },
      documentCountRef: { current: createStubElement() },
      bridgeDocumentId: null,
      activeAnswerRequestId: null,
      recentDocuments: [{
        documentId: 'doc-1', fileName: 'note.md',
        updatedAt: '2026-07-25T08:00:00.000Z', annotationCount: 2, questionCount: 0,
        answerDocuments: [
          { requestId: 'a1', question: '一级问题', kind: 'reply', updatedAt: '2026-07-25T08:00:00.000Z' },
          { requestId: 'a2', question: '二级追问', kind: 'reply', parentRequestId: 'a1', updatedAt: '2026-07-25T09:00:00.000Z' },
          { requestId: 'm1', question: '三级 AI 追问', engine: 'claude', parentRequestId: 'a2', updatedAt: '2026-07-25T10:00:00.000Z' }
        ]
      }],
      _expandedAnswerDocIds: new Set(['doc-1']), // 追问树默认收起，此处展开以校验递归嵌套
      openRecentDocument() {},
      openAnswerDocument(documentId: string, requestId: string) { openedAnswers.push([documentId, requestId]); },
      openReadingMap() {}
    });

    editor._renderRecentDocuments();

    const texts = collectTexts(list);
    assert.ok(texts.includes('一级问题'));
    assert.ok(texts.includes('二级追问'));
    assert.ok(texts.includes('三级 AI 追问'));
    // 三层节点 → 三个层级容器逐级嵌套
    const levels = findAllByClass(list, 'recent-document-children');
    assert.equal(levels.length, 3, '每层子文档一个层级容器');
    assert.ok(findAllByClass(levels[0], 'recent-document-children').length >= 2, '层级容器应逐级嵌套而非平铺');

    const grandchild = findAllByClass(list, 'recent-answer-item')
      .find((item) => collectTexts(item as never).includes('三级 AI 追问'));
    assert.ok(grandchild, '孙节点应渲染');
    (grandchild as { dispatch?: (t: string) => void }).dispatch!('click');
    assert.deepEqual(openedAnswers, [['doc-1', 'm1']]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as Record<string, unknown>).document;
  }
});

test('_answerTrail 回溯追问链，面包屑从根到父级', () => {
  const editor = Object.create(BridgeMethods.prototype);
  const doc = {
    fileName: 'note.md',
    messages: [{ requestId: 'm1', question: 'AI 问题', answer: '答', parentRequestId: 'a1' }],
    annotations: [
      { id: 'a1', type: 'idea', note: '一级问题', reply: '一级答案' },
      { id: 'a2', type: 'idea', note: '二级追问', reply: '二级答案', answerRequestId: 'm1' }
    ]
  };

  assert.deepEqual(editor._answerTrail(doc, 'a1'), []);
  assert.deepEqual(editor._answerTrail(doc, 'm1'), ['一级问题']);
  assert.deepEqual(editor._answerTrail(doc, 'a2'), ['一级问题', 'AI 问题']);
});

test('打开子文档时来源行带追问路径面包屑', async () => {
  const restore = installFetchStub({
    '/api/documents/doc-1': {
      document: {
        documentId: 'doc-1', fileName: 'note.md', content: '# 原文',
        annotations: [
          { id: 'a1', type: 'idea', quote: '原文句子', note: '一级问题', reply: '一级答案' },
          { id: 'a2', type: 'idea', quote: '一级答案句子', note: '二级追问', reply: '二级答案', answerRequestId: 'a1' }
        ],
        messages: []
      }
    }
  });
  try {
    const editor = createEditor();
    Object.assign(editor, {
      viewMode: 'split',
      _syncViewMode() {},
      _renderPreview() {},
      _setStatus() {},
      closeDocumentSidebar() {}
    });

    await editor.openAnswerDocument('doc-1', 'a2');

    assert.match(editor.previewOverrideMarkdown, /来源：note\.md › 一级问题/);
  } finally {
    restore();
  }
});

test('打开子文档时状态栏文案截断超长问题', async () => {
  const longNote = '哇哦！这不正是我现在正在做的事情吗？其实 my_soul_os 也正是在解决这个问题啊，有种不谋而合的感觉啊。';
  const restore = installFetchStub({
    '/api/documents/doc-1': {
      document: {
        documentId: 'doc-1', fileName: 'note.md', content: '# 原文',
        annotations: [{ id: 'a1', type: 'idea', quote: '句子', note: longNote, reply: '答案' }],
        messages: []
      }
    }
  });
  try {
    const statuses: string[] = [];
    const editor = createEditor();
    Object.assign(editor, {
      viewMode: 'split',
      _syncViewMode() {},
      _renderPreview() {},
      _setStatus(text: string) { statuses.push(text); },
      closeDocumentSidebar() {}
    });

    await editor.openAnswerDocument('doc-1', 'a1');

    const status = statuses[statuses.length - 1];
    assert.ok(status.startsWith('正在阅读摘录回答 · '), status);
    assert.ok(status.length <= '正在阅读摘录回答 · '.length + 25, '状态栏不应塞进整段问题：' + status);
    assert.match(status, /…$/);
  } finally {
    restore();
  }
});

test('打开摘录回答：无对应消息时回退到带回复的批注', async () => {
  const restore = installFetchStub({
    '/api/documents/doc-1': {
      document: {
        documentId: 'doc-1', fileName: 'note.md', content: '# 原文',
        annotations: [{ id: 'a1', type: 'idea', quote: '这段原文', note: '如何衡量效率？', reply: '别处找到的答案' }],
        messages: []
      }
    }
  });
  try {
    const editor = createEditor();
    Object.assign(editor, {
      viewMode: 'split',
      _syncViewMode() {},
      _renderPreview() {},
      _setStatus() {},
      closeDocumentSidebar() {}
    });

    await editor.openAnswerDocument('doc-1', 'a1');

    assert.equal(editor.activeAnswerRequestId, 'a1');
    assert.match(editor.previewOverrideMarkdown, /摘录回答/);
    assert.match(editor.previewOverrideMarkdown, /如何衡量效率？/);
    assert.match(editor.previewOverrideMarkdown, /别处找到的答案/);
    assert.match(editor.previewOverrideMarkdown, /这段原文/);
    assert.equal(editor.viewMode, 'preview');
  } finally {
    restore();
  }
});

test('_commentsFromBridge 透传批注上的回复内容与视图标记', () => {
  const editor = Object.create(BridgeMethods.prototype);

  const comments = editor._commentsFromBridge(
    [
      { id: 'a1', type: 'idea', quote: '原文', note: '想法', reply: '贴进来的答案', replyAt: 1753600000000 },
      { id: 'a2', type: 'marker', quote: '答案里的划线', answerRequestId: 'r-1' }
    ],
    [],
    'doc-1'
  );

  assert.equal(comments[0].reply, '贴进来的答案');
  assert.equal(comments[0].replyAt, 1753600000000);
  assert.equal(comments[0].answerRequestId, undefined);
  assert.equal(comments[1].answerRequestId, 'r-1');
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

test('打开工作区文档前先冲刷防抖中的同步，未落盘批注不被覆盖', async () => {
  const events: string[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    events.push((init?.method || 'GET') + ' ' + String(input).split('/api/')[1]);
    if (init?.method === 'POST') return { ok: true, json: async () => ({ documentId: 'doc-1' }) };
    return {
      ok: true,
      json: async () => ({
        document: { documentId: 'doc-1', fileName: 'note.md', content: 'x', annotations: [], messages: [] }
      })
    };
  }) as typeof fetch;
  try {
    const editor = createEditor();
    Object.assign(editor, {
      sourceRef: { current: { value: '正文' } },
      previewRef: { current: { querySelectorAll: () => [] } },
      fileName: 'note.md',
      activeAnswerRequestId: null,
      previewOverrideMarkdown: '',
      _bridgeSyncT: setTimeout(() => {}, 60_000),
      _refreshRecentDocuments: async () => {},
      _detachLocalFile() {},
      _cleanOpenedMarkdown: (text: string) => text,
      _resetEditingHistory() {},
      _commentsFromBridge: () => [],
      _setFileName() {},
      _showConversationMessages() {},
      _renderComments() {},
      _renderPreview() {},
      _setDirty() {},
      _setStatus() {},
      closeDocumentSidebar() {},
      async _reattachLocalFileForDocument() {},
      _hydrateLocalImages() {}
    });

    await editor.openRecentDocument('doc-1');

    assert.equal(editor._bridgeSyncT, null, '挂起的同步计时器应被清掉');
    assert.deepEqual(events[0], 'POST documents', '应先把未落盘的批注同步到 bridge');
    assert.deepEqual(events[1], 'GET documents/doc-1', '之后才用 bridge 数据重建');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('同步计时器触发后清除标记，冲刷不再重复发同步', async () => {
  const editor = createEditor();
  editor.sourceRef = { current: { value: '正文' } };
  editor.fileName = 'note.md';
  let synced = 0;
  editor._syncDocumentToBridge = async () => { synced += 1; };

  editor._scheduleBridgeSync();
  await new Promise((resolve) => setTimeout(resolve, 850));
  assert.equal(synced, 1);
  assert.equal(editor._bridgeSyncT, null, '计时器触发后应清除标记');

  await editor._flushBridgeSync();
  assert.equal(synced, 1, '没有挂起变更时冲刷不应重复同步');
});

test('删除当前文档时取消挂起的同步，防止文档被重新登记', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({}) })) as typeof fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { confirm: () => true }, configurable: true });
  try {
    const editor = createEditor();
    editor.bridgeDocumentId = 'doc-1';
    editor._bridgeSyncT = setTimeout(() => {}, 60_000);
    editor._refreshRecentDocuments = async () => {};
    editor._renderPreview = () => {};
    editor._setStatus = () => {};

    await editor.deleteRecentDocument({ documentId: 'doc-1', fileName: 'note.md' });

    assert.equal(editor._bridgeSyncT, null);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as Record<string, unknown>).window;
  }
});

test('从最近阅读打开后，图片替换发生在重新接上本地句柄之后', async () => {
  const restore = installFetchStub({
    '/api/documents/doc-1': {
      document: {
        documentId: 'doc-1', fileName: 'note.md', localPath: '/tmp/note.md',
        content: '![图](./a.png)', annotations: [], messages: []
      }
    }
  });
  try {
    const order: string[] = [];
    const editor = createEditor();
    Object.assign(editor, {
      sourceRef: { current: { value: '' } },
      previewRef: { current: { querySelectorAll: () => [] } },
      activeAnswerRequestId: null,
      previewOverrideMarkdown: '',
      fileName: 'note.md',
      _detachLocalFile() {},
      _cleanOpenedMarkdown: (text: string) => text,
      _resetEditingHistory() {},
      _commentsFromBridge: () => [],
      _setFileName() {},
      _showConversationMessages() {},
      _renderComments() {},
      _renderPreview() { order.push('render'); },
      _setDirty() {},
      _setStatus() {},
      closeDocumentSidebar() {},
      async _reattachLocalFileForDocument() {
        order.push('reattach');
        editor.localFilePath = '/tmp/note.md';
      },
      _hydrateLocalImages() { order.push('hydrate'); }
    });

    await editor.openRecentDocument('doc-1');

    const reattachAt = order.indexOf('reattach');
    const hydrateAt = order.lastIndexOf('hydrate');
    assert.ok(reattachAt >= 0, '应重新接上本地句柄');
    assert.ok(hydrateAt > reattachAt, '接上句柄后应补齐相对路径图片');
  } finally {
    restore();
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
