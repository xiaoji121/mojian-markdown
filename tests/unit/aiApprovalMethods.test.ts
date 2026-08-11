import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIApprovalMethods } from '../../src/editor/aiApprovalMethods.ts';
import { createRef, createStubElement, createSourceStub } from '../helpers/dom.ts';

function createEditor(content = '# 旧正文') {
  const editor = Object.create(AIApprovalMethods.prototype);
  return Object.assign(editor, {
    sourceRef: createRef(createSourceStub(content)),
    statuses: [] as string[],
    _setStatus(text: string) { this.statuses.push(text); },
    _recordAIProgress() {},
    _renderAIMessages() {}
  });
}

test('执行级审批展示 diff，并把一次性票据决定提交给 Bridge', async () => {
  const editor = createEditor();
  const previousFetch = globalThis.fetch;
  const posts: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    posts.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return { ok: true, json: async () => ({ ok: true }) };
  }) as typeof fetch;
  try {
    const prompts: string[] = [];
    const approved = await editor._reviewAIApproval({
      approvalId: 'approval-1', argsHash: 'hash-1', toolName: 'replace_current_document',
      summary: '润色标题', diff: { preview: '- # 旧正文\n+ # 新正文', addedLines: 1, removedLines: 1 }
    }, { originalContent: '# 旧正文', assistant: {} }, (prompt: string) => {
      prompts.push(prompt);
      return true;
    });

    assert.equal(approved, true);
    assert.match(prompts[0], /- # 旧正文/);
    assert.match(prompts[0], /\+ # 新正文/);
    assert.match(posts[0].url, /\/api\/approvals\/approval-1$/);
    assert.deepEqual(posts[0].body, { approved: true, argsHash: 'hash-1' });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('等待审批时正文发生变化会自动拒绝，避免覆盖用户编辑', async () => {
  const editor = createEditor('# 用户刚刚修改');
  const previousFetch = globalThis.fetch;
  const decisions: unknown[] = [];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    decisions.push(JSON.parse(String(init?.body)));
    return { ok: true, json: async () => ({ ok: true }) };
  }) as typeof fetch;
  try {
    let confirmCalled = false;
    const approved = await editor._reviewAIApproval({
      approvalId: 'approval-conflict', argsHash: 'hash-conflict',
      diff: { preview: '- 旧\n+ 新', addedLines: 1, removedLines: 1 }
    }, { originalContent: '# 旧正文', assistant: {} }, () => {
      confirmCalled = true;
      return true;
    });

    assert.equal(approved, false);
    assert.equal(confirmCalled, false);
    assert.deepEqual(decisions[0], { approved: false, argsHash: 'hash-conflict' });
    assert.match(editor.statuses.at(-1), /正文已变化/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Agent 更新作为独立编辑历史写入，可由一键撤销恢复', () => {
  const editor = createEditor();
  const calls: string[] = [];
  Object.assign(editor, {
    bridgeDocumentId: 'doc-1',
    _syncCurrentEditingState() { calls.push('sync'); },
    _recordEditingHistory(type: string, force: boolean) { calls.push(`history:${type}:${force}`); },
    _renderPreview() { calls.push('preview'); },
    _updateCount() { calls.push('count'); },
    _touch() { calls.push('touch'); },
    undoEdit() { calls.push('undo'); }
  });

  assert.equal(editor._applyAIDocumentUpdate({ documentId: 'doc-1', content: '# 新正文' }, '# 旧正文'), true);
  assert.equal(editor.sourceRef.current.value, '# 新正文');
  assert.deepEqual(calls.slice(0, 5), ['sync', 'history:agent:true', 'preview', 'count', 'touch']);

  const message = { documentUndoAvailable: true };
  editor.undoAIDocumentUpdate(message);
  assert.equal(message.documentUndoAvailable, false);
  assert.equal(calls.at(-1), 'undo');
});

test('回答卡片为已应用的 Agent 修改显示一键撤销', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => createStubElement() }
  });
  try {
    const editor = createEditor();
    const item = createStubElement();
    const message = { role: 'assistant', documentUndoAvailable: true };
    let undone = false;
    editor.undoAIDocumentUpdate = () => { undone = true; };

    editor._appendAIDocumentUndoAction(item, message);
    const actions = item.children[0] as ReturnType<typeof createStubElement>;
    const button = actions.children[0] as ReturnType<typeof createStubElement>;
    assert.equal(button.textContent, '撤销 Agent 修改');
    button.dispatch('click');
    assert.equal(undone, true);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete (globalThis as Record<string, unknown>).document;
  }
});
