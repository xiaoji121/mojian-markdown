import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PathComposeMethods } from '../../src/editor/pathComposeMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

// 追问树父指针：m1 ← a1 ← 主文档；a2 挂在 a1 下。
function createComposer(overrides: Record<string, unknown> = {}) {
  const editor = Object.create(PathComposeMethods.prototype);
  return Object.assign(editor, {
    agentBridgeEnabled: true,
    aiEngine: 'claude',
    activeAnswerRequestId: null,
    previewOverrideMarkdown: '# 阅读脉络',
    bridgeDocumentId: 'doc-1',
    _readingPathDocId: 'doc-1',
    _readingPathSelection: new Set<string>(),
    _readingMapIndex: { doc0: '', q0: 'm1', q1: 'a1', q2: 'a2' },
    _readingMapParents: new Map([['m1', 'a1'], ['a1', ''], ['a2', 'a1']]),
    readingPathSelectMode: true,
    _aiEngineLabel: () => 'Claude',
    _renderPreview() {},
    _setStatus() {},
    _refreshRecentDocuments: async () => {},
    openRecentDocument: async () => {},
    ...overrides
  });
}

test('_toggleReadingPathNode 选中节点连同上级链路，再点一次仅取消该节点', () => {
  const editor = createComposer();

  editor._toggleReadingPathNode('m1');
  assert.deepEqual([...editor._readingPathSelection].sort(), ['a1', 'm1'], '选中叶子自动带上整条路径');

  editor._toggleReadingPathNode('m1');
  assert.deepEqual([...editor._readingPathSelection], ['a1'], '再点一次只取消该节点本身');

  editor._toggleReadingPathNode('');
  assert.ok(editor._readingPathSelection.has(''), '主文档节点可单独点选');
});

test('_applyReadingPathHighlight 依据选择状态给 mermaid 节点加标记', () => {
  const nodeA = { ...createStubElement(), id: 'flowchart-q1-12' };
  const nodeB = { ...createStubElement(), id: 'flowchart-q0-7' };
  const preview = createStubElement();
  preview.querySelectorAll = () => [nodeA, nodeB] as never[];
  const editor = createComposer({ previewRef: createRef(preview) });
  editor._readingPathSelection = new Set(['a1']);

  editor._applyReadingPathHighlight();

  assert.equal(nodeA.classList.contains('is-path-selected'), true, 'q1 → a1 已选中');
  assert.equal(nodeB.classList.contains('is-path-selected'), false, 'q0 → m1 未选中');
});

function sseResponse(packets: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => index < packets.length
          ? { done: false, value: encoder.encode(packets[index++]) }
          : { done: true, value: undefined }
      })
    }
  };
}

test('composeReadingPath 流式渲染生成内容，完成后打开新文档', async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    requests.push(String(init?.body || ''));
    return sseResponse([
      'event: meta\ndata: {"documentId":"doc-1","nodeCount":2}\n\n',
      'event: delta\ndata: {"text":"# 长文\\n\\n第一段。"}\n\n',
      'event: delta\ndata: {"text":"第二段。"}\n\n',
      'event: done\ndata: {"composedDocumentId":"doc-2","fileName":"note · 路径长文 0731-1700.md"}\n\n'
    ]);
  }) as typeof fetch;
  try {
    const opened: string[] = [];
    const rendered: string[] = [];
    const statuses: string[] = [];
    const editor = createComposer({
      _renderPreview() { rendered.push(String(this.previewOverrideMarkdown)); },
      openRecentDocument: async (documentId: string) => { opened.push(documentId); },
      _setStatus(message: string) { statuses.push(message); }
    });
    editor._readingPathSelection = new Set(['a1', 'm1']);

    await editor.composeReadingPath('article');

    const payload = JSON.parse(requests[0]);
    assert.equal(payload.documentId, 'doc-1');
    assert.deepEqual(payload.requestIds.sort(), ['a1', 'm1']);
    assert.equal(payload.mode, 'article');
    assert.equal(payload.engine, 'claude');
    assert.ok(rendered.some((markdown) => markdown.includes('第一段。')), '生成过程流式渲染进预览');
    assert.deepEqual(opened, ['doc-2'], '完成后打开生成的新文档');
    assert.equal(editor._composeBusy, false);
    assert.ok(statuses.some((message) => message.includes('路径长文')));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('composeReadingPath 出错时恢复脉络视图并提示', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => sseResponse([
    'event: error\ndata: {"message":"引擎执行失败"}\n\n'
  ])) as typeof fetch;
  try {
    const opened: string[] = [];
    const statuses: string[] = [];
    const editor = createComposer({
      openRecentDocument: async (documentId: string) => { opened.push(documentId); },
      _setStatus(message: string) { statuses.push(message); }
    });
    editor._readingPathSelection = new Set(['a1']);

    await editor.composeReadingPath('remix');

    assert.equal(editor.previewOverrideMarkdown, '# 阅读脉络', '失败后回到脉络视图');
    assert.equal(opened.length, 0);
    assert.ok(statuses.some((message) => message.includes('引擎执行失败')));
    assert.equal(editor._composeBusy, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('composeReadingPath 透传补充要求输入框内容，空白则不带 instruction', async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    requests.push(String(init?.body || ''));
    return sseResponse([
      'event: done\ndata: {"composedDocumentId":"doc-2","fileName":"x.md"}\n\n'
    ]);
  }) as typeof fetch;
  try {
    const editor = createComposer({ readingPathInstructionRef: createRef({ value: '  用第一人称写  ' }) });
    editor._readingPathSelection = new Set(['a1']);
    await editor.composeReadingPath('article');
    assert.equal(JSON.parse(requests[0]).instruction, '用第一人称写', '首尾空白应去除');

    const blank = createComposer({ readingPathInstructionRef: createRef({ value: '   ' }) });
    blank._readingPathSelection = new Set(['a1']);
    await blank.composeReadingPath('article');
    assert.ok(!('instruction' in JSON.parse(requests[1])), '空白输入不应出现 instruction 字段');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function withHelpDom(run: (body: ReturnType<typeof createStubElement>) => void) {
  const previousDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const body = createStubElement();
  Object.defineProperty(globalThis, 'document', {
    value: {
      createElement: () => createStubElement(),
      body,
      addEventListener() {},
      removeEventListener() {}
    },
    configurable: true
  });
  try {
    run(body);
  } finally {
    if (previousDoc) Object.defineProperty(globalThis, 'document', previousDoc);
    else delete (globalThis as Record<string, unknown>).document;
  }
}

function popoverTexts(pop: { children?: unknown[] }) {
  const texts: string[] = [];
  (pop.children || []).forEach((child) => texts.push(String((child as { textContent?: string }).textContent || '')));
  return texts.join('\n');
}

test('toggleReadingPathHelp 弹出模式说明，再点关闭，切换模式换内容', () => {
  withHelpDom((body) => {
    const editor = createComposer();

    editor.toggleReadingPathHelp('article');
    const pop = body.children[0] as ReturnType<typeof createStubElement>;
    assert.ok(pop, '说明浮层挂到 body');
    assert.equal(pop.classList.contains('is-visible'), true);
    assert.match(popoverTexts(pop), /整理成长文/);
    assert.match(popoverTexts(pop), /梳理/, 'article 是忠于路径的梳理');
    assert.match(popoverTexts(pop), /上下文相同/, '页脚说明两种模式上下文一致');

    editor.toggleReadingPathHelp('remix');
    assert.match(popoverTexts(pop), /二创/, '切换模式后内容更新');
    assert.match(popoverTexts(pop), /再创作/);

    editor.toggleReadingPathHelp('remix');
    assert.equal(pop.classList.contains('is-visible'), false, '同一问号再点一次关闭');
  });
});

test('composeReadingPath 没有选中节点时不发请求', async () => {
  const previousFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (async () => { called += 1; return sseResponse([]); }) as typeof fetch;
  try {
    const editor = createComposer();
    await editor.composeReadingPath('article');
    assert.equal(called, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('生成途中用户离开视图：不再抢占预览，也不自动打开新文档', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => sseResponse([
    'event: delta\ndata: {"text":"一段内容"}\n\n',
    'event: done\ndata: {"composedDocumentId":"doc-2","fileName":"x.md"}\n\n'
  ])) as typeof fetch;
  try {
    const opened: string[] = [];
    const editor = createComposer({
      openRecentDocument: async (documentId: string) => { opened.push(documentId); },
      // 第一次流式渲染后模拟用户切走：override 被其他视图清空
      _renderPreview() { this.previewOverrideMarkdown = ''; }
    });
    editor._readingPathSelection = new Set(['a1']);

    await editor.composeReadingPath('article');

    assert.equal(editor.previewOverrideMarkdown, '', '不夺回用户已切换的视图');
    assert.equal(opened.length, 0, '用户已离开时不自动打开生成文档');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
