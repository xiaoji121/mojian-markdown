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
    aiEngineChipRef: createRef(createStubElement()),
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

test('引擎同步：更新面板 chip 文本并转发到设置弹窗', () => {
  const editor = createEditor();
  const synced: number[] = [];
  editor._syncAISettingsEngine = () => synced.push(1);
  editor.aiEngine = 'gemini';

  editor._syncAIEngineSwitch();

  assert.equal(editor.aiEngineChipRef.current.textContent, 'Gemini', 'chip 显示当前引擎');
  assert.equal(synced.length, 1, '设置弹窗选中态一并同步');
});

test('AI 引擎支持 Gemini（API Key 提供方）', () => {
  const editor = createEditor();

  editor.setAIEngine('gemini');

  assert.equal(editor.aiEngine, 'gemini');
  assert.equal(editor._aiEngineLabel(), 'Gemini');

  const body = editor._aiChatRequestBody('这段讲什么？');
  assert.equal(body.engine, 'gemini');
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

// ===== 统一入口：普通问题只读，项目操作按次确认 =====

test('默认是问答模式，请求体带 mode=chat（零回归）', () => {
  const editor = createEditor();

  assert.equal(editor._aiChatRequestBody('这段讲什么').mode, 'chat');
});

test('明确的项目操作请求在确认后按 Agent 模式发送', () => {
  const editor = createEditor();
  const prompts: string[] = [];
  const mode = editor._resolveQuestionMode('请修改项目里的 README 文件', (message: string) => {
    prompts.push(message);
    return true;
  });

  assert.equal(mode, 'agent');
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /项目文件/);
  assert.equal(editor._aiChatRequestBody('请修改项目里的 README 文件', mode).mode, 'agent');
});

test('普通阅读问题直接按只读问答发送，不弹确认', () => {
  const editor = createEditor();
  let confirmed = false;
  const mode = editor._resolveQuestionMode('解释一下这段代码的作用', () => {
    confirmed = true;
    return true;
  });

  assert.equal(mode, 'chat');
  assert.equal(confirmed, false);
});

test('拒绝项目工具授权时取消请求', () => {
  const editor = createEditor();
  assert.equal(editor._resolveQuestionMode('运行项目测试', () => false), null);
});

test('Gemini 遇到项目操作时不发送并提示切换渠道', () => {
  const editor = createEditor();
  editor.aiEngine = 'gemini';

  assert.equal(editor._resolveQuestionMode('把这篇发布到飞书', () => true), null);
  assert.ok(editor.statuses.some((text: string) => text.includes('Claude') && text.includes('Codex')));
});
