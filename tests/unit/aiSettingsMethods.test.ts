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
  gemini: { configured: true, apiKeyTail: '3456', model: 'gemini-2.5-pro', proxy: 'http://127.0.0.1:7890', baseURL: '' },
  kimi: { configured: true, apiKeyTail: '2233', model: 'kimi-k2.5', proxy: '', baseURL: 'https://api.moonshot.cn/v1' },
  qwen: { configured: false, apiKeyTail: '', model: 'qwen-plus', proxy: '', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  custom: { configured: false, apiKeyTail: '', model: '', proxy: '', baseURL: '' }
};

function findAll(
  el: { className?: string; children?: unknown[] },
  cls: string,
  out: Array<ReturnType<typeof createStubElement> & { className?: string }> = []
) {
  if ((el.className || '').split(' ').includes(cls)) out.push(el as never);
  (el.children || []).forEach((child) => findAll(child as never, cls, out));
  return out;
}

function collectTexts(el: { textContent?: string; children?: unknown[] }, out: string[] = []) {
  if (el.textContent) out.push(el.textContent);
  (el.children || []).forEach((child) => collectTexts(child as typeof el, out));
  return out;
}

test('设置弹窗按渠道分组列出本地 Agent 与四种 API Agent', async () => {
  await withDom(async (body) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => MASKED })) as typeof fetch;
    try {
      const editor = createEditor();
      editor.aiEngine = 'gemini';

      await editor.openAISettings();

      const overlay = body.children[0] as ReturnType<typeof createStubElement>;
      const groups = findAll(overlay, 'ai-channel-group');
      assert.equal(groups.length, 2, '两个渠道分组');
      const text = collectTexts(overlay).join('\n');
      assert.match(text, /本地 Agent/);
      assert.match(text, /API Key/);

      const options = findAll(overlay, 'ai-channel-option');
      assert.deepEqual(
        options.map((option) => option.dataset.engine),
        ['claude', 'codex', 'gemini', 'kimi', 'qwen', 'custom'],
        '六个引擎选项'
      );
      const gemini = options.find((option) => option.dataset.engine === 'gemini')!;
      assert.equal(gemini.getAttribute('aria-checked'), 'true', '当前引擎选中');
      assert.equal(gemini.classList.contains('is-active'), true);
      const claude = options.find((option) => option.dataset.engine === 'claude')!;
      assert.equal(claude.getAttribute('aria-checked'), 'false');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('点击渠道选项立即切换引擎并更新选中态', async () => {
  await withDom(async (body) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => MASKED })) as typeof fetch;
    try {
      const editor = createEditor();
      editor.aiEngine = 'claude';
      const switched: string[] = [];
      editor.setAIEngine = function (engine: string) {
        switched.push(engine);
        this.aiEngine = engine;
        this._syncAISettingsEngine();
      };

      await editor.openAISettings();
      const overlay = body.children[0] as ReturnType<typeof createStubElement>;
      const codex = findAll(overlay, 'ai-channel-option').find((option) => option.dataset.engine === 'codex')!;
      codex.dispatch('click');

      assert.deepEqual(switched, ['codex'], '点击选项调用 setAIEngine');
      assert.equal(codex.classList.contains('is-active'), true, '选中态跟随切换');
      assert.equal(codex.getAttribute('aria-checked'), 'true');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

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

test('切换到千问后表单与保存请求跟随当前提供方', async () => {
  await withDom(async (body) => {
    const posts: string[] = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST') posts.push(String(init.body));
      return { ok: true, json: async () => MASKED };
    }) as typeof fetch;
    try {
      const editor = createEditor();
      editor.aiEngine = 'gemini';
      editor.setAIEngine = function (engine: string) {
        this.aiEngine = engine;
        this._syncAISettingsEngine();
      };
      await editor.openAISettings();
      const overlay = body.children[0] as ReturnType<typeof createStubElement>;
      findAll(overlay, 'ai-channel-option').find((item) => item.dataset.engine === 'qwen')!.dispatch('click');
      assert.equal(editor._aiSettingsInputs.model.value, 'qwen-plus');
      assert.match(editor._aiSettingsInputs.baseURL.value, /dashscope/);
      editor._aiSettingsInputs.key.value = 'qwen-new-key';
      await editor._saveAISettings();
      const payload = JSON.parse(posts[0]);
      assert.equal(payload.qwen.apiKey, 'qwen-new-key');
      assert.equal(payload.gemini, undefined);
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
