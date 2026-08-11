import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIMethods } from '../../src/editor/aiMethods.ts';
import { AIReadingTreeMethods } from '../../src/editor/aiReadingTreeMethods.ts';
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

test('AI 引擎支持 Kimi、千问与自定义兼容提供方', () => {
  const editor = createEditor();
  for (const [engine, label] of [['kimi', 'Kimi'], ['qwen', '通义千问'], ['custom', '自定义 Agent']]) {
    editor.setAIEngine(engine);
    assert.equal(editor.aiEngine, engine);
    assert.equal(editor._aiEngineLabel(), label);
    assert.equal(editor._aiChatRequestBody('解释文档').engine, engine);
  }
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

test('修改当前文档时逐次确认写权限，并在请求体中授权本次写入', () => {
  const editor = createEditor();
  const prompts: string[] = [];
  const question = '直接修改原文档，把中文润色后写回去';

  assert.equal(editor._resolveQuestionMode(question, (message: string) => {
    prompts.push(message);
    return true;
  }), 'agent');
  assert.match(prompts[0], /修改当前文档或项目文件/);
  assert.equal(editor._aiChatRequestBody(question, 'agent').allowWrite, true);
  assert.equal(editor._aiChatRequestBody('运行项目测试', 'agent').allowWrite, false);
  assert.equal(editor._questionNeedsProjectTools('那就直接改吧'), true, '多轮对话里的简短确认也应触发逐次写授权');
  assert.equal(editor._aiChatRequestBody('那就直接改吧', 'agent').allowWrite, true);
});

test('划线引用发送一次后被消费，后续对话不再携带旧引用', () => {
  const editor = createEditor();
  editor.aiMessages = [{ role: 'user', text: '第一问' }];
  editor._renderAIQuote = () => {};

  const first = editor._aiChatRequestBody('第一问');
  editor._consumeAIQuote();
  const followup = editor._aiChatRequestBody('继续说说');

  assert.equal(first.selection.quote, '选中的原文');
  assert.equal(followup.selection.quote, '');
  assert.equal(followup.selection.surroundingText, '');
  assert.equal(editor.aiOccurrence, 0);
  assert.equal(editor.aiStart, undefined);
});

test('当前引用模块只在存在待发送引用时展开', () => {
  const editor = createEditor();
  const context = createStubElement();
  const quote = createStubElement();
  quote.closest = () => context;
  editor.aiQuoteRef = createRef(quote);
  editor.aiMessages = [];

  editor._renderAIQuote();
  assert.equal(context.classList.contains('has-quote'), true);

  editor.aiQuote = '';
  editor._renderAIQuote();
  assert.equal(context.classList.contains('has-quote'), false);
});

test('打开历史对话时不恢复最后一次划线引用', () => {
  const editor = createEditor();
  Object.assign(editor, {
    aiMessages: [],
    _renderAIMessages() {},
    _renderAIQuote() {},
    _syncAICommentsFromHistory() {}
  });

  editor._showConversationMessages('doc-1', [{
    requestId: 'r1', question: '解释', quote: '已经过期的划线', answer: '回答'
  }], null, false);

  assert.equal(editor.aiQuote, '');
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

test('API Agent 遇到项目操作时也可在确认后进入 Agent 模式', () => {
  const editor = createEditor();
  editor.aiEngine = 'gemini';

  assert.equal(editor._resolveQuestionMode('读取项目 README 并解释', () => true), 'agent');
});

test('失败回答渲染可操作的重试按钮', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => createStubElement() }
  });
  try {
    const editor = createEditor();
    const item = createStubElement();
    const retried: string[] = [];
    editor.retryAIMessage = (id: string) => { retried.push(id); };
    const message = {
      id: 'failed-1', role: 'assistant', failed: true, retrying: false,
      retry: { question: '解释这段', quote: '原引用', engine: 'codex' }
    };

    editor._appendAIRetryAction(item, message);

    const actions = item.children[0] as ReturnType<typeof createStubElement>;
    const button = actions.children[0] as ReturnType<typeof createStubElement> & { disabled: boolean };
    assert.equal(button.textContent, '重试');
    assert.equal(button.disabled, false);
    button.dispatch('click');
    assert.deepEqual(retried, ['failed-1']);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete (globalThis as Record<string, unknown>).document;
  }
});

test('重试失败回答时恢复原问题、引用和引擎，并防止重复触发', async () => {
  const editor = createEditor();
  const input = { value: '', focus() {} };
  const sent: Array<{ question: string; quote: string; engine: string }> = [];
  const failed = {
    id: 'failed-1', role: 'assistant', failed: true, retrying: false,
    retry: {
      question: '帮我找一下这篇原文', quote: 'A frontier without an ecosystem is not stable',
      occurrence: 2, start: 18, engine: 'codex'
    }
  };
  Object.assign(editor, {
    aiBusy: false,
    aiMessages: [failed],
    aiInputRef: createRef(input),
    _renderAIMessages() {},
    _renderAIQuote() {},
    _syncAIEngineSwitch() {},
    async sendAIQuestion() {
      sent.push({ question: input.value, quote: this.aiQuote, engine: this.aiEngine });
      return true;
    }
  });

  const first = editor.retryAIMessage('failed-1');
  await editor.retryAIMessage('failed-1');
  await first;

  assert.deepEqual(sent, [{
    question: '帮我找一下这篇原文',
    quote: 'A frontier without an ecosystem is not stable',
    engine: 'codex'
  }]);
  assert.equal(editor.aiOccurrence, 2);
  assert.equal(editor.aiStart, 18);
  assert.equal(failed.retrying, false);
  assert.equal(failed.retried, true);
});

test('Agent 执行进度只保留有限条可见摘要', () => {
  const editor = createEditor();
  const assistant = { role: 'assistant', progress: [] as Array<{ label: string; state: string }> };
  for (let index = 0; index < 15; index += 1) {
    editor._recordAIProgress(assistant, { label: '步骤 ' + index, state: index === 14 ? 'running' : 'done' });
  }

  assert.equal(assistant.progress.length, 12);
  assert.equal(assistant.progress[0].label, '步骤 3');
  assert.equal(assistant.progress[11].label, '步骤 14');
});

test('内置 Agent 的 token 用量显示在回答元信息中', () => {
  const editor = createEditor();
  editor._renderAIMessages = () => {};
  const state = {
    assistant: { meta: '已使用项目工具' },
    userMessage: {}, aiComment: {}, contextMeta: '已使用项目工具'
  };
  editor._handleAIStreamEvent('usage', { inputTokens: 120, outputTokens: 30, totalTokens: 150 }, state);
  assert.match(state.assistant.meta, /150 tokens/);
});

test('点击 Agent 生成的 Markdown 入口时用墨笺打开工作区文档', async () => {
  const editor = createEditor();
  const opened: string[] = [];
  editor.openRecentDocument = async (id: string) => { opened.push(id); };
  const artifact = editor._matchAIMarkdownArtifact('./生成结果.md', [
    { href: './生成结果.md', documentId: 'doc-generated', fileName: '生成结果.md' }
  ]);

  assert.equal(artifact.documentId, 'doc-generated');
  await editor._openAIMarkdownArtifact(artifact.documentId);
  assert.deepEqual(opened, ['doc-generated']);
});

test('已归档的 AI 回答可直接打开对应阅读节点', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => createStubElement() }
  });
  try {
    const editor = createEditor();
    const item = createStubElement();
    const opened: string[] = [];
    const message = {
      id: 'a-q1', role: 'assistant', requestId: 'q1', documentId: 'doc-1', text: '回答'
    };
    Object.assign(editor, {
      _appendAIReadingTreeAction: AIReadingTreeMethods.prototype._appendAIReadingTreeAction,
      _openAIReadingNode: AIReadingTreeMethods.prototype._openAIReadingNode,
      async openAnswerDocument(documentId: string, requestId: string) {
        opened.push(documentId + ':' + requestId);
      }
    });

    editor._appendAIReadingTreeAction(item, message);
    const actions = item.children[0] as ReturnType<typeof createStubElement>;
    const button = actions.children[0] as ReturnType<typeof createStubElement>;
    assert.equal(button.textContent, '打开阅读节点');
    button.dispatch('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(opened, ['doc-1:q1']);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete (globalThis as Record<string, unknown>).document;
  }
});

test('已移除的历史问答可重新加入阅读树', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => createStubElement() }
  });
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return { ok: true };
  }) as typeof fetch;
  try {
    const editor = createEditor();
    const item = createStubElement();
    const message = {
      id: 'a-q1', role: 'assistant', requestId: 'q1', documentId: 'doc-1',
      hiddenFromReadingTree: true
    };
    let rendered = 0;
    let refreshed = 0;
    Object.assign(editor, {
      aiMessages: [message],
      _appendAIReadingTreeAction: AIReadingTreeMethods.prototype._appendAIReadingTreeAction,
      restoreAIMessageToTree: AIReadingTreeMethods.prototype.restoreAIMessageToTree,
      _renderAIMessages() { rendered += 1; },
      async _refreshRecentDocuments() { refreshed += 1; }
    });

    editor._appendAIReadingTreeAction(item, message);
    const actions = item.children[0] as ReturnType<typeof createStubElement>;
    const button = actions.children[0] as ReturnType<typeof createStubElement>;
    assert.equal(button.textContent, '重新加入阅读树');
    button.dispatch('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(requests[0].init?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { hiddenFromReadingTree: false });
    assert.equal(message.hiddenFromReadingTree, false);
    assert.equal(rendered, 1);
    assert.equal(refreshed, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete (globalThis as Record<string, unknown>).document;
  }
});
