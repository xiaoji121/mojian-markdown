import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadingMapMethods } from '../../src/editor/readingMapMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

const sampleDoc = {
  documentId: 'doc-1',
  fileName: 'note.md',
  content: '# 原文',
  messages: [
    { requestId: 'm1', question: '问 AI 的问题', answer: '答案', engine: 'claude', parentRequestId: 'a1' }
  ],
  annotations: [
    { id: 'a1', type: 'idea', note: '一级问题', reply: '一级答案' },
    { id: 'a2', type: 'idea', note: '二级追问', reply: '二级答案', answerRequestId: 'a1' },
    { id: 'a3', type: 'idea', note: '没有回复的想法' }
  ]
};

test('_readingMapMarkdown 生成 mermaid 追问脉络图', () => {
  const editor = Object.create(ReadingMapMethods.prototype);

  const markdown = editor._readingMapMarkdown(sampleDoc);

  assert.match(markdown, /```mermaid/);
  assert.match(markdown, /flowchart/);
  assert.match(markdown, /note\.md/);
  assert.match(markdown, /一级问题/);
  assert.match(markdown, /二级追问/);
  assert.match(markdown, /问 AI 的问题/);
  assert.doesNotMatch(markdown, /没有回复的想法/, '未形成子文档的批注不进脉络图');
  // 根 → a1，a1 → a2，a1 → m1 三条边
  assert.equal((markdown.match(/-->/g) || []).length, 3);
});

test('阅读脉络不展示已隐藏问答及其子追问', () => {
  const editor = Object.create(ReadingMapMethods.prototype);
  const doc = {
    fileName: 'note.md',
    annotations: [],
    messages: [
      { requestId: 'q1', question: '隐藏的问题', answer: '答', hiddenFromReadingTree: true },
      { requestId: 'q2', question: '隐藏分支的追问', answer: '答', parentRequestId: 'q1' },
      { requestId: 'q3', question: '保留的问题', answer: '答' }
    ]
  };

  const markdown = editor._readingMapMarkdown(doc);

  assert.doesNotMatch(markdown, /隐藏的问题/);
  assert.doesNotMatch(markdown, /隐藏分支的追问/);
  assert.match(markdown, /保留的问题/);
});

test('_readingMapMarkdown 对特殊字符与超长问题做安全处理', () => {
  const editor = Object.create(ReadingMapMethods.prototype);
  const doc = {
    fileName: 'note.md',
    messages: [],
    annotations: [{
      id: 'a1', type: 'idea',
      note: '包含 "引号" [方括号] `反引号` 和一个特别特别特别特别特别特别特别特别长的问题描述',
      reply: '答'
    }]
  };

  const markdown = editor._readingMapMarkdown(doc);

  const body = (markdown.split('```mermaid')[1] || '').split('```')[0];
  assert.doesNotMatch(body, /"引号"/, '节点标签里的双引号应被清理');
  assert.doesNotMatch(body, /\[方括号\]/, '节点标签里的方括号应被清理');
  assert.doesNotMatch(body, /`/, '节点标签里的反引号应被清理');
  assert.doesNotMatch(body, /长的问题描述/, '超长问题应被截断');
});

function createMapEditor(events: string[] = [], rendered: string[] = []) {
  const editor = Object.create(ReadingMapMethods.prototype);
  return Object.assign(editor, {
    viewMode: 'split',
    bridgeDocumentId: null,
    activeDocumentId: null,
    activeAnswerRequestId: 'stale',
    previewOverrideMarkdown: '',
    previewRef: createRef(createStubElement()),
    async _flushBridgeSync() { events.push('flush'); },
    _syncViewMode() {},
    _renderPreview() { rendered.push('preview'); },
    _renderRecentDocuments() {},
    _setStatus() {},
    closeDocumentSidebar() {}
  });
}

test('openReadingMap 冲刷同步后进入脉络 override 视图', async () => {
  const previousFetch = globalThis.fetch;
  const events: string[] = [];
  globalThis.fetch = (async () => {
    events.push('load');
    return { ok: true, json: async () => ({ document: sampleDoc }) };
  }) as typeof fetch;
  try {
    const rendered: string[] = [];
    const editor = createMapEditor(events, rendered);

    await editor.openReadingMap('doc-1');

    assert.deepEqual(events, ['flush', 'load'], '先冲刷再读取，脉络里才有最新回复');
    assert.match(editor.previewOverrideMarkdown, /flowchart/);
    assert.equal(editor.activeAnswerRequestId, null, '脉络视图不属于任何子文档');
    assert.equal(editor.bridgeDocumentId, 'doc-1');
    assert.equal(editor.viewMode, 'preview');
    assert.ok(rendered.includes('preview'));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openReadingMap 建立节点索引并只绑定一次点击委托', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ document: sampleDoc }) })) as typeof fetch;
  try {
    const editor = createMapEditor();
    let bound = 0;
    const preview = editor.previewRef.current;
    const originalAdd = preview.addEventListener.bind(preview);
    preview.addEventListener = (type: string, listener: (e: unknown) => void) => {
      bound += 1;
      originalAdd(type, listener);
    };

    await editor.openReadingMap('doc-1');
    await editor.openReadingMap('doc-1');

    // 节点顺序：消息在前（m1），批注在后（a1、a2）
    assert.deepEqual(editor._readingMapIndex, { doc0: '', q0: 'm1', q1: 'a1', q2: 'a2' });
    assert.equal(bound, 1, '点击委托只应绑定一次');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openReadingMap 构建父指针索引，供路径选择沿链路上溯', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ document: sampleDoc }) })) as typeof fetch;
  try {
    const editor = createMapEditor();

    await editor.openReadingMap('doc-1');

    assert.equal(editor._readingMapParents.get('m1'), 'a1');
    assert.equal(editor._readingMapParents.get('a1'), '', '无父节点回落到主文档');
    assert.equal(editor._readingMapParents.get('a2'), 'a1');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('选择模式下点击节点转交路径选择，不打开子文档', () => {
  const editor = Object.create(ReadingMapMethods.prototype);
  const opened: string[] = [];
  const toggled: string[] = [];
  Object.assign(editor, {
    previewOverrideMarkdown: '# 阅读脉络',
    activeAnswerRequestId: null,
    bridgeDocumentId: 'doc-1',
    readingPathSelectMode: true,
    _readingMapIndex: { doc0: '', q0: 'm1', q1: 'a1' },
    _toggleReadingPathNode(requestId: string) { toggled.push(requestId); },
    openAnswerDocument(_documentId: string, requestId: string) { opened.push(requestId); },
    openRecentDocument(documentId: string) { opened.push(documentId); }
  });
  const eventFor = (id: string) => ({ target: { closest: () => ({ id }) } });

  editor._onReadingMapClick(eventFor('flowchart-q0-1'));
  editor._onReadingMapClick(eventFor('flowchart-doc0-7'));

  assert.deepEqual(toggled, ['m1', ''], '子文档节点与主文档节点都进入选择');
  assert.equal(opened.length, 0, '选择模式下不再跳转');
});

test('点击脉络图节点打开对应子文档，点击根节点回主文档', () => {
  const editor = Object.create(ReadingMapMethods.prototype);
  const opened: Array<[string, string]> = [];
  const openedDocs: string[] = [];
  Object.assign(editor, {
    previewOverrideMarkdown: '# 阅读脉络',
    activeAnswerRequestId: null,
    bridgeDocumentId: 'doc-1',
    _readingMapIndex: { doc0: '', q0: 'm1', q1: 'a1' },
    openAnswerDocument(documentId: string, requestId: string) { opened.push([documentId, requestId]); },
    openRecentDocument(documentId: string) { openedDocs.push(documentId); }
  });
  const eventFor = (id: string) => ({ target: { closest: () => ({ id }) } });

  editor._onReadingMapClick(eventFor('flowchart-q1-42'));
  assert.deepEqual(opened, [['doc-1', 'a1']]);

  editor._onReadingMapClick(eventFor('flowchart-doc0-7'));
  assert.deepEqual(openedDocs, ['doc-1']);

  // 已进入子文档视图后，残留索引不应再劫持点击
  editor.activeAnswerRequestId = 'a1';
  editor._onReadingMapClick(eventFor('flowchart-q0-1'));
  assert.equal(opened.length, 1);
});
