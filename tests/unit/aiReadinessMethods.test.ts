import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIReadinessMethods, describeAIReadiness } from '../../src/editor/aiReadinessMethods.ts';

const ready = { bridgeAvailable: true, providers: {
  claude: { executable: 'found', login: 'unverified' }, codex: { executable: 'missing', login: 'unverified' },
  gemini: { configured: false, credentialStatus: 'empty', storage: 'available', connection: 'unverified' }
} };

test('CLI found explicitly keeps login unverified; bridge alone never means ready', () => {
  assert.match(describeAIReadiness(ready, 'claude').text, /登录尚未验证/);
  assert.equal(describeAIReadiness(ready, 'claude').canRequest, true);
  assert.equal(describeAIReadiness({ bridgeAvailable: true }, 'claude').canRequest, false);
  assert.match(describeAIReadiness(ready, 'codex').text, /未找到/);
  assert.equal(describeAIReadiness(ready, 'codex').canRequest, false);
});

test('translation requires Gemini irrespective of chat choice and locked keys are unusable', () => {
  assert.equal(describeAIReadiness(ready, 'gemini').canRequest, false);
  const configured = structuredClone(ready);
  configured.providers.gemini.configured = true;
  configured.providers.gemini.storage = 'locked';
  assert.equal(describeAIReadiness(configured, 'gemini').canRequest, false);
  assert.match(describeAIReadiness(configured, 'gemini').text, /锁定/);
  configured.providers.gemini.storage = 'available';
  assert.equal(describeAIReadiness(configured, 'gemini').canRequest, true);
  assert.match(describeAIReadiness(configured, 'gemini').text, /未验证/);
});

test('newer readiness wins and late failed request cannot mark it offline', async () => {
  const original = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = ((url, init) => new Promise((resolve, reject) => calls.push({ url, init, resolve, reject }))) as any;
  try {
    const editor = Object.assign(Object.create(AIReadinessMethods.prototype), {
      aiEngine: 'claude', _renderAIReadiness() {}, _setAIStatus() {}
    });
    const old = editor._refreshAIReadiness();
    const current = editor._refreshAIReadiness();
    assert.equal(calls[0].init.signal.aborted, true);
    calls[1].resolve({ ok: true, json: async () => ready });
    await current;
    calls[0].reject(new Error('late offline'));
    await old;
    assert.equal(editor.aiReadiness, ready);
    assert.equal(editor.aiBridgeOnline, true);
  } finally { globalThis.fetch = original; }
});

test('offline readiness is retryable and checks never send provider requests', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async url => { calls.push(String(url)); throw new Error('offline'); }) as any;
  try {
    const editor = Object.assign(Object.create(AIReadinessMethods.prototype), {
      aiEngine: 'claude', _renderAIReadiness() {}, _setAIStatus() {}
    });
    await editor._refreshAIReadiness();
    assert.equal(editor.aiBridgeOnline, false);
    assert.equal(describeAIReadiness(editor.aiReadiness, 'claude').canRequest, false);
    assert.deepEqual(calls, ['http://127.0.0.1:4317/api/readiness']);
  } finally { globalThis.fetch = original; }
});

import { AIMethods } from '../../src/editor/aiMethods.ts';
import { TranslateMethods } from '../../src/editor/translateMethods.ts';
import { createStubElement } from '../helpers/dom.ts';

test('repeated send checks once and missing AI preserves the unsent question', async () => {
  let finish; let checks = 0;
  const editor = Object.assign(Object.create(AIMethods.prototype), {
    agentBridgeEnabled: true, aiInputRef: { current: { value: 'Unsent question' } },
    _ensureAIReady() { checks++; return new Promise(resolve => { finish = resolve; }); }
  });
  const first = editor.sendAIQuestion();
  const second = await editor.sendAIQuestion();
  assert.equal(checks, 1);
  assert.equal(second, false);
  finish(false);
  assert.equal(await first, false);
  assert.equal(editor.aiInputRef.current.value, 'Unsent question');
});

test('translation checks Gemini before provider contact and close invalidates late readiness', async () => {
  const original = globalThis.window;
  globalThis.window = { getSelection: () => null } as any;
  try {
    let finish; let selected; let streamed = 0;
    const popover = createStubElement();
    const editor = Object.assign(Object.create(TranslateMethods.prototype), {
      agentBridgeEnabled: true, aiEngine: 'claude', _pending: { quote: 'hello' }, selBarRef: {},
      _translateBody: createStubElement(), _translateActions: createStubElement(),
      _buildTranslatePopover() { this._translatePopoverEl = popover; return popover; },
      _clampTranslatePopover() {}, _setStatus() {},
      _ensureAIReady(engine) { selected = engine; return new Promise(resolve => { finish = resolve; }); },
      _streamTranslation() { streamed++; }
    });
    const pending = editor.translateSel();
    assert.equal(selected, 'gemini');
    editor._hideTranslatePopover();
    finish(true);
    await pending;
    assert.equal(streamed, 0);
    assert.equal(popover.style.display, 'none');
  } finally { globalThis.window = original; }
});

test('closing the AI panel during readiness cancels the pending send', async () => {
  let finish;
  const editor = Object.assign(Object.create(AIMethods.prototype), {
    agentBridgeEnabled: true, aiInputRef: { current: { value: 'Unsent question' } },
    aiPanelRef: { current: createStubElement() }, _syncFullscreenLayout() {},
    _ensureAIReady() { return new Promise(resolve => { finish = resolve; }); }
  });
  const pending = editor.sendAIQuestion();
  editor._openAIPanel(false);
  finish(true);
  assert.equal(await pending, false);
  assert.equal(editor.aiInputRef.current.value, 'Unsent question');
});

test('returning from translation settings offers explicit retry without provider contact', () => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => createStubElement() } as any;
  try {
    let requests = 0;
    const editor = Object.assign(Object.create(TranslateMethods.prototype), {
      _translateSetupReturn: true, _translatePopoverEl: createStubElement(),
      _translateBody: createStubElement(), _translateActions: createStubElement(),
      _clampTranslatePopover() {}, translateSel() { requests++; }
    });
    editor._resumeAISetup();
    assert.equal(requests, 0);
    assert.equal(editor._translatePopoverEl.style.display, 'flex');
    assert.equal(editor._translateActions.children[0].textContent, '重新翻译');
    editor._translateActions.children[0].dispatch('click');
    assert.equal(requests, 1);
  } finally { globalThis.document = original; }
});

test('readiness refresh keeps configure/retry buttons stable for keyboard focus', () => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => createStubElement() } as any;
  try {
    const host = createStubElement();
    const editor = Object.assign(Object.create(AIReadinessMethods.prototype), {
      aiReadinessRef: { current: host }, aiEngine: 'claude', aiReadiness: ready
    });
    editor._renderAIReadiness();
    const actions = host.children[1];
    editor.aiEngine = 'codex';
    editor._renderAIReadiness();
    assert.equal(host.children[1], actions);
    assert.equal(host.children.length, 2);
    assert.match(editor._aiReadinessText.textContent, /未找到/);
  } finally { globalThis.document = original; }
});

for (const field of ['bridgeDocumentId', 'activeDocumentId', 'localFilePath', 'activeAnswerRequestId', 'aiQuote', 'aiStart']) {
  test(`readiness cannot send a question after ${field} changes`, async () => {
    let finish;
    const editor = Object.assign(Object.create(AIMethods.prototype), {
      agentBridgeEnabled: true, aiInputRef: { current: { value: 'Question about original context' } },
      [field]: 'original',
      _ensureAIReady() { return new Promise(resolve => { finish = resolve; }); },
      _aiChatRequestBody() { throw new Error('Changed context must never reach provider request'); }
    });
    const pending = editor.sendAIQuestion();
    editor[field] = 'different';
    finish(true);
    assert.equal(await pending, false);
  });
}
