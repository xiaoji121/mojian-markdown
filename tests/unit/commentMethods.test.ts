import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommentMethods } from '../../src/editor/commentMethods.ts';

function createEditor() {
  const editor = Object.create(CommentMethods.prototype);
  editor.comments = [];
  return editor;
}

test('_commentText 附带贴入的回复', () => {
  const editor = createEditor();

  const text = editor._commentText(
    { type: 'idea', quote: '原文片段', note: '如何衡量这个效率？', reply: '从另一本书里找到的答案' },
    0
  );

  assert.match(text, /我的想法：如何衡量这个效率？/);
  assert.match(text, /找到的回答：从另一本书里找到的答案/);
});

test('_commentText 没有回复时不输出回答行', () => {
  const editor = createEditor();

  const text = editor._commentText({ type: 'idea', quote: '原文片段', note: '想法' }, 0);

  assert.doesNotMatch(text, /找到的回答/);
});

test('在摘录回答视图创建的批注带上视图标记，主文档视图不带', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { getSelection: () => null }, configurable: true });
  try {
    const editor = createEditor();
    Object.assign(editor, {
      selBarRef: { current: null },
      _persist() {},
      _renderPreview() {},
      _renderComments() {}
    });

    editor.previewOverrideMarkdown = '# 摘录回答';
    editor.activeAnswerRequestId = 'r-1';
    editor._pending = { quote: '答案片段', occ: 0, start: 5 };
    const scoped = editor._createAnnotation('marker', false);
    assert.equal(scoped.answerRequestId, 'r-1');

    editor.previewOverrideMarkdown = '';
    editor.activeAnswerRequestId = null;
    editor._pending = { quote: '原文片段', occ: 0, start: 2 };
    const main = editor._createAnnotation('marker', false);
    assert.equal(main.answerRequestId, undefined);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete (globalThis as Record<string, unknown>).window;
  }
});

test('_commentVisibleInPreview 按当前视图过滤批注', () => {
  const editor = createEditor();
  const mainComment = { id: 'a', quote: 'x' };
  const scopedComment = { id: 'b', quote: 'y', answerRequestId: 'r-1' };
  const otherScoped = { id: 'c', quote: 'z', answerRequestId: 'r-2' };

  editor.previewOverrideMarkdown = '';
  editor.activeAnswerRequestId = null;
  assert.equal(editor._commentVisibleInPreview(mainComment), true);
  assert.equal(editor._commentVisibleInPreview(scopedComment), false);

  editor.previewOverrideMarkdown = '# 摘录回答';
  editor.activeAnswerRequestId = 'r-1';
  assert.equal(editor._commentVisibleInPreview(mainComment), false);
  assert.equal(editor._commentVisibleInPreview(scopedComment), true);
  assert.equal(editor._commentVisibleInPreview(otherScoped), false);

  // 阅读脉络图：override 视图但不属于任何子文档，不渲染任何批注高亮
  editor.previewOverrideMarkdown = '# 阅读脉络';
  editor.activeAnswerRequestId = null;
  assert.equal(editor._commentVisibleInPreview(mainComment), false);
  assert.equal(editor._commentVisibleInPreview(scopedComment), false);
});

function createFocusEditor() {
  const editor = createEditor();
  return Object.assign(editor, {
    bridgeDocumentId: 'doc-1',
    previewOverrideMarkdown: '',
    activeAnswerRequestId: null,
    previewRef: { current: { querySelector: () => null } },
    commentListRef: { current: null },
    opened: [] as Array<[string, string]>,
    rendered: 0,
    _openPanel() {},
    _renderPreview() { (this as { rendered: number }).rendered += 1; },
    _renderRecentDocuments() {},
    async openAnswerDocument(documentId: string, requestId: string) {
      (this as { opened: Array<[string, string]> }).opened.push([documentId, requestId]);
    }
  });
}

test('点击子文档批注时先切换到它所属的子文档视图', async () => {
  const editor = createFocusEditor();
  editor.comments = [{ id: 'c1', quote: '答案里的句子', type: 'idea', answerRequestId: 'r-1' }];

  await editor._focusComment('c1');

  assert.deepEqual(editor.opened, [['doc-1', 'r-1']]);
});

test('在子文档视图点击主文档批注时退回主文档视图', async () => {
  const editor = createFocusEditor();
  editor.previewOverrideMarkdown = '# 摘录回答';
  editor.activeAnswerRequestId = 'r-1';
  editor.comments = [{ id: 'c1', quote: '主文档句子', type: 'marker' }];

  await editor._focusComment('c1');

  assert.equal(editor.previewOverrideMarkdown, '');
  assert.equal(editor.activeAnswerRequestId, null);
  assert.ok(editor.rendered >= 1, '应重新渲染主文档预览');
  assert.equal(editor.opened.length, 0);
});

test('批注就在当前视图时不做视图切换', async () => {
  const editor = createFocusEditor();
  editor.comments = [{ id: 'c1', quote: '主文档句子', type: 'marker' }];

  await editor._focusComment('c1');

  assert.equal(editor.opened.length, 0);
  assert.equal(editor.rendered, 0);
});

test('阅读脉络视图下不弹出划词工具条', () => {
  const editor = createEditor();
  const bar = { style: {} as Record<string, string> };
  Object.assign(editor, {
    previewRef: { current: {} },
    selBarRef: { current: bar },
    previewOverrideMarkdown: '# 阅读脉络',
    activeAnswerRequestId: null
  });

  // 后续逻辑会访问 window.getSelection，若守卫缺失此处会抛错
  editor._onPreviewSelect();

  assert.equal(bar.style.display, 'none');
});

test('_fullWithComments 输出贴入的回复', () => {
  const editor = createEditor();
  editor.sourceRef = { current: { value: '正文内容' } };
  editor.fileName = 'note.md';
  editor.comments = [
    { type: 'idea', quote: '原文片段', note: '如何衡量这个效率？', reply: '从另一本书里找到的答案' }
  ];

  const out = editor._fullWithComments();

  assert.match(out, /找到的回答/);
  assert.match(out, /从另一本书里找到的答案/);
});
