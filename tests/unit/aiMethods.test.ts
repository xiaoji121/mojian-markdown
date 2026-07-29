import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIMethods } from '../../src/editor/aiMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

function createEditor() {
  const editor = Object.create(AIMethods.prototype);
  return Object.assign(editor, {
    aiEngine: 'claude',
    aiQuote: '选中的原文',
    aiOccurrence: 0,
    fileName: 'note.md',
    persisted: 0,
    statuses: [] as string[],
    aiEngineSwitchRef: createRef(createStubElement()),
    _persist() { this.persisted += 1; },
    _setStatus(msg: string) { this.statuses.push(msg); },
    _documentPayload: () => ({ fileName: 'note.md', content: '' }),
    _selectionContext: () => '上下文'
  });
}

test('切换 AI 引擎会持久化选择', () => {
  const editor = createEditor();

  editor.setAIEngine('codex');

  assert.equal(editor.aiEngine, 'codex');
  assert.ok(editor.persisted >= 1);

  editor.setAIEngine('不认识的引擎');
  assert.equal(editor.aiEngine, 'claude');
});

test('问答请求体携带当前引擎', () => {
  const editor = createEditor();
  editor.aiEngine = 'codex';

  const body = editor._aiChatRequestBody('这段讲什么？');

  assert.equal(body.engine, 'codex');
  assert.equal(body.question, '这段讲什么？');
  assert.equal(body.selection.quote, '选中的原文');
});

test('在子文档视图问 AI 时请求体携带 parentRequestId', () => {
  const editor = createEditor();
  editor.previewOverrideMarkdown = '# 摘录回答';
  editor.activeAnswerRequestId = 'a1';

  const body = editor._aiChatRequestBody('追问一下');
  assert.equal(body.parentRequestId, 'a1');

  editor.previewOverrideMarkdown = '';
  editor.activeAnswerRequestId = null;
  const mainBody = editor._aiChatRequestBody('主文档提问');
  assert.equal(mainBody.parentRequestId, undefined);
});

test('引擎标签用于消息署名', () => {
  const editor = createEditor();
  assert.equal(editor._aiEngineLabel(), 'Claude');
  editor.aiEngine = 'codex';
  assert.equal(editor._aiEngineLabel(), 'Codex');
});
