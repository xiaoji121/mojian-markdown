import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiMessages } from '../../src/editor/locales/ai.ts';

test('AI interface supplies all three target languages and preserves interpolation fields', () => {
  assert.deepEqual(aiMessages['正在翻译…'], ['正在翻譯…', 'Translating…', '翻訳中…']);
  assert.ok(Object.keys(aiMessages).length > 100);
  for (const [source, translations] of Object.entries(aiMessages)) {
    assert.equal(translations.length, 3);
    const fields = source.match(/\{\w+\}/g)?.sort() || [];
    for (const translated of translations) {
      assert.ok(translated.trim());
      assert.deepEqual(translated.match(/\{\w+\}/g)?.sort() || [], fields, source);
    }
  }
});

import { setLocale, messages } from '../../src/editor/i18n.ts';
import { AISettingsMethods } from '../../src/editor/aiSettingsMethods.ts';
import { AIReadinessMethods } from '../../src/editor/aiReadinessMethods.ts';
import { createStubElement } from '../helpers/dom.ts';
Object.assign(messages, aiMessages);

test('AI settings translate in place without altering unsaved key, model or proxy', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => createStubElement(), body: createStubElement()
  } });
  try {
    setLocale('zh-CN');
    const editor = Object.create(AISettingsMethods.prototype);
    editor._buildAISettingsModal();
    const inputs = editor._aiSettingsInputs;
    inputs.key.value = 'unsaved-key'; inputs.model.value = 'custom-model'; inputs.proxy.value = 'custom-proxy';
    setLocale('ja');
    editor._refreshAISettingsLocale();
    assert.equal(editor._aiSettingsDialog.getAttribute('aria-label'), 'AI 設定');
    assert.equal(editor._aiSettingsCloseBtn.textContent, '閉じる');
    assert.deepEqual([inputs.key.value, inputs.model.value, inputs.proxy.value], ['unsaved-key', 'custom-model', 'custom-proxy']);
  } finally {
    setLocale('zh-CN');
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as any).document;
  }
});

test('existing readiness actions update on locale change without replacing controls', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => createStubElement() } });
  try {
    setLocale('zh-CN');
    const host = createStubElement();
    const editor = Object.assign(Object.create(AIReadinessMethods.prototype), { aiReadinessRef: { current: host } });
    editor._renderAIReadiness();
    const actions = host.children[1] as any;
    const retry = actions.children[1];
    setLocale('en'); editor._renderAIReadiness();
    assert.equal(retry.textContent, 'Check again');
    assert.equal(actions.children[1], retry);
    assert.equal(host.children.length, 2);
  } finally {
    setLocale('zh-CN');
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as any).document;
  }
});

import { AIMethods } from '../../src/editor/aiMethods.ts';

test('UI locale does not translate user questions, selections or document content', () => {
  const document = { content: '正在翻译…', title: '保存' };
  const editor = Object.assign(Object.create(AIMethods.prototype), {
    aiEngine: 'gemini', aiQuote: '设置', aiOccurrence: 2,
    _documentPayload: () => document, _selectionContext: () => '未命名文档'
  });
  try {
    for (const locale of ['zh-TW', 'en', 'ja']) {
      setLocale(locale);
      const body = editor._aiChatRequestBody('重新检查');
      assert.equal(body.question, '重新检查');
      assert.equal(body.document, document);
      assert.deepEqual(body.selection, { quote: '设置', occurrence: 2, surroundingText: '未命名文档' });
    }
  } finally { setLocale('zh-CN'); }
});
