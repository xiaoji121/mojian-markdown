import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AISettingsMethods } from '../../src/editor/aiSettingsMethods.ts';
import { createStubElement } from '../helpers/dom.ts';

function withDom(run: (body: ReturnType<typeof createStubElement>) => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const body = createStubElement();
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement(), body },
    configurable: true
  });
  return run(body).finally(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as Record<string, unknown>).document;
  });
}

function createEditor() {
  const editor = Object.create(AISettingsMethods.prototype);
  return Object.assign(editor, {
    statuses: [] as string[],
    _setStatus(text: string) { (this as { statuses: string[] }).statuses.push(text); }
  });
}

const MASKED = {
  gemini: { configured: true, apiKeyTail: '3456', model: 'gemini-2.5-pro', proxy: 'http://127.0.0.1:7890' }
};

test('打开设置弹窗时加载掩码配置回填表单（含代理地址）', async () => {
  await withDom(async (body) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => MASKED })) as typeof fetch;
    try {
      const editor = createEditor();

      await editor.openAISettings();

      assert.ok(body.children.length >= 1, '设置弹窗应挂到 body');
      const inputs = editor._aiSettingsInputs;
      assert.ok(inputs, '应保留输入框引用');
      assert.match(inputs.key.placeholder || '', /3456/);
      assert.equal(inputs.model.value, 'gemini-2.5-pro');
      assert.equal(inputs.proxy.value, 'http://127.0.0.1:7890');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('保存：Key 留空不覆盖，填写则提交，模型始终提交', async () => {
  await withDom(async () => {
    const posts: string[] = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST') posts.push(String(init.body));
      return { ok: true, json: async () => MASKED };
    }) as typeof fetch;
    try {
      const editor = createEditor();
      await editor.openAISettings();

      editor._aiSettingsInputs.key.value = '   ';
      editor._aiSettingsInputs.model.value = 'gemini-2.5-flash';
      editor._aiSettingsInputs.proxy.value = '';
      await editor._saveAISettings();
      assert.equal(posts.length, 1);
      const blankSave = JSON.parse(posts[0]);
      assert.equal('apiKey' in blankSave.gemini, false, 'Key 留空时不应提交 apiKey');
      assert.equal(blankSave.gemini.model, 'gemini-2.5-flash');
      assert.equal(blankSave.gemini.proxy, '', '代理清空后应提交空串以清除');

      await editor.openAISettings();
      editor._aiSettingsInputs.key.value = ' AIzaSyNew999 ';
      await editor._saveAISettings();
      const keySave = JSON.parse(posts[1]);
      assert.equal(keySave.gemini.apiKey, 'AIzaSyNew999', '填写后应提交去除首尾空白的 Key');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('测试连接：用当前表单值调用验证接口并把结果显示在弹窗里', async () => {
  await withDom(async () => {
    const posts: Array<[string, string]> = [];
    const previousFetch = globalThis.fetch;
    let testResult: unknown = { ok: true, model: 'gemini-2.5-pro', reply: 'OK' };
    globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      if (url.includes('/api/settings/test')) {
        posts.push([url, String(init?.body)]);
        return { ok: true, json: async () => testResult };
      }
      return { ok: true, json: async () => MASKED };
    }) as typeof fetch;
    try {
      const editor = createEditor();
      await editor.openAISettings();
      editor._aiSettingsInputs.key.value = ' typed-key ';

      await editor._testAISettings();

      const body = JSON.parse(posts[0][1]);
      assert.equal(body.gemini.apiKey, 'typed-key', '应测试表单里正在输入的 Key');
      assert.match(editor._aiSettingsNote.textContent, /连接成功/);
      assert.equal(editor._aiSettingsNote.getAttribute('data-state'), 'ok');

      testResult = { ok: false, message: 'API key not valid' };
      await editor._testAISettings();
      assert.match(editor._aiSettingsNote.textContent, /API key not valid/);
      assert.equal(editor._aiSettingsNote.getAttribute('data-state'), 'error');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('清除已保存的 Key 提交空串', async () => {
  await withDom(async () => {
    const posts: string[] = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST') posts.push(String(init.body));
      return { ok: true, json: async () => MASKED };
    }) as typeof fetch;
    try {
      const editor = createEditor();
      await editor.openAISettings();

      await editor._clearAIKey();

      assert.equal(JSON.parse(posts[0]).gemini.apiKey, '');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
