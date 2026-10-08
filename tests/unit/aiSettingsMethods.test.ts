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

test('设置弹窗按渠道分组列出引擎：本地 Agent（Claude/Codex）与 API Key（Gemini）', async () => {
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
        ['claude', 'codex', 'gemini'],
        '三个引擎选项'
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
      assert.match(inputs.key.placeholder || '', /已配置/);
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

test('close clears password and a pending open cannot reopen the dismissed settings modal', async () => {
  await withDom(async () => {
    const before = globalThis.fetch;
    let finish;
    globalThis.fetch = (() => new Promise((resolve) => { finish = resolve; })) as typeof fetch;
    try {
      const editor = createEditor();
      const opening = editor.openAISettings();
      editor._aiSettingsInputs.key.value = 'FAKE-secret-only';
      editor.closeAISettings();
      assert.equal(editor._aiSettingsInputs.key.value, '');
      finish({ ok: true, json: async () => MASKED });
      await opening;
      assert.equal(editor._aiSettingsEl.style.display, 'none');
    } finally { globalThis.fetch = before; }
  });
});

for (const operation of ['_clearAIKey', '_migrateAIKey']) {
  test(`${operation} late response cannot clear a newly reopened form`, async () => {
    await withDom(async () => {
      const editor = createEditor();
      editor._buildAISettingsModal();
      editor._aiSettingsEpoch = 1;
      let finish;
      editor._requestAISettings = () => new Promise((resolve) => { finish = resolve; });
      const pending = editor[operation]();
      editor.closeAISettings();
      editor._aiSettingsEpoch++;
      editor._aiSettingsInputs.key.value = 'FAKE-new-unsaved-key';
      editor._aiSettingsInputs.model.value = 'gemini-new-model';
      finish({ providers: MASKED, secureStorage: { available: true, status: 'available' } });
      await pending;
      assert.equal(editor._aiSettingsInputs.key.value, 'FAKE-new-unsaved-key');
      assert.equal(editor._aiSettingsInputs.model.value, 'gemini-new-model');
      assert.equal(editor.aiProviderSettings, undefined);
    });
  });
}

test('stale rejected load does not reset a newer successfully loaded settings form', async () => {
  await withDom(async () => {
    const editor = createEditor();
    editor._buildAISettingsModal();
    editor._aiSettingsEpoch = 1;
    let rejectOld;
    editor._requestAISettings = () => new Promise((_resolve, reject) => { rejectOld = reject; });
    const pending = editor._loadAISettings(1);
    editor._aiSettingsEpoch = 2;
    editor.aiProviderSettings = MASKED;
    editor._aiSettingsInputs.key.value = 'FAKE-new-input';
    rejectOld(new Error('old request failed'));
    await pending;
    assert.equal(editor.aiProviderSettings, MASKED);
    assert.equal(editor._aiSettingsInputs.key.value, 'FAKE-new-input');
  });
});

test('repeated save click submits one operation and immediately clears the typed password', async () => {
  await withDom(async () => {
    const editor = createEditor();
    editor._buildAISettingsModal();
    editor._aiSettingsInputs.key.value = 'FAKE-typed-secret';
    let finish; let calls = 0;
    editor._requestAISettings = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    const pending = editor._saveAISettings();
    await editor._saveAISettings();
    assert.equal(calls, 1);
    assert.equal(editor._aiSettingsInputs.key.value, '');
    finish({ providers: MASKED });
    await pending;
  });
});

test('blank desktop model is a valid preserve operation across structured clone', async () => {
  await withDom(async () => {
    const editor = createEditor();
    editor._buildAISettingsModal();
    editor._aiSettingsInputs.model.value = '';
    let received;
    editor._requestAISettings = async (_op, payload) => { received = structuredClone(payload); return { providers: MASKED }; };
    await editor._saveAISettings();
    assert.equal(received.gemini.model, '');
  });
});

const SETTINGS = { providers: MASKED, secureStorage: { available: true, status: 'available' } };

test('connection test explicitly targets Gemini and keeps Google/cost/saved-proxy disclosure visible', async () => {
  await withDom(async () => {
    const editor = createEditor();
    editor.aiEngine = 'codex';
    editor._requestAISettings = async (operation) => operation === 'test' ? { ok: true } : SETTINGS;
    await editor.openAISettings();
    const disclosure = findAll(editor._aiSettingsEl, 'ai-settings-disclosure')[0];
    assert.ok(disclosure, 'privacy and cost disclosure is separate from the transient result');
    for (const text of ['Gemini', 'Google', '费用', '已保存', '点击']) assert.ok(disclosure.textContent.includes(text));
    assert.equal(findAll(editor._aiSettingsEl, 'ai-settings-test')[0].textContent, '测试 Gemini 连接');
    const before = disclosure.textContent;
    await editor._testAISettings();
    assert.equal(disclosure.textContent, before);
    assert.match(editor._aiSettingsNote.textContent, /Gemini.*连接成功/);
    assert.equal(editor.aiEngine, 'codex');
  });
});

for (const field of ['key', 'model', 'proxy']) {
  test(`${field} edits invalidate both a completed and an in-flight Gemini test`, async () => {
    await withDom(async () => {
      const editor = createEditor();
      editor._requestAISettings = async (operation) => operation === 'test' ? { ok: true } : SETTINGS;
      await editor.openAISettings();
      await editor._testAISettings();
      editor._aiSettingsInputs[field].value = 'changed';
      editor._aiSettingsInputs[field].dispatch('input');
      assert.notEqual(editor._aiSettingsNote.getAttribute('data-state'), 'ok');
      assert.match(editor._aiSettingsNote.textContent, /重新测试/);
      let finish;
      editor._requestAISettings = () => new Promise(resolve => { finish = resolve; });
      const pending = editor._testAISettings();
      editor._aiSettingsInputs[field].value = 'changed-again';
      editor._aiSettingsInputs[field].dispatch('input');
      finish({ ok: true });
      await pending;
      assert.notEqual(editor._aiSettingsNote.getAttribute('data-state'), 'ok');
      assert.match(editor._aiSettingsNote.textContent, /重新测试/);
    });
  });
}

test('Gemini test coalesces repeated clicks through close/reopen and ignores late success', async () => {
  await withDom(async () => {
    const editor = createEditor();
    let finish; let calls = 0;
    editor._requestAISettings = (operation) => operation === 'load' ? Promise.resolve(SETTINGS)
      : (calls++, new Promise(resolve => { finish = resolve; }));
    await editor.openAISettings();
    const pending = editor._testAISettings();
    await editor._testAISettings();
    assert.equal(calls, 1);
    editor.closeAISettings();
    await editor.openAISettings();
    await editor._testAISettings();
    assert.equal(calls, 1, 'reopening cannot create another billable request while the original is pending');
    editor._aiSettingsInputs.key.value = 'FAKE-new-key';
    finish({ ok: true });
    await pending;
    assert.notEqual(editor._aiSettingsNote.getAttribute('data-state'), 'ok');
    assert.equal(editor._aiSettingsInputs.key.value, 'FAKE-new-key');
    assert.equal(editor._aiSettingsBusy, false);
  });
});

test('settings exposes an accessible dialog and live status', async () => {
  await withDom(async () => {
    const editor = createEditor();
    editor._buildAISettingsModal();
    const dialog = findAll(editor._aiSettingsEl, 'ai-settings-modal')[0];
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(editor._aiSettingsNote.getAttribute('role'), 'status');
    let prevented = false;
    editor._aiSettingsEl.dispatch('keydown', { key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
    assert.equal(editor._aiSettingsEl.style.display, 'none');
  });
});

test('settings close refreshes an open AI panel and resumes setup without testing a provider', async () => {
  await withDom(async () => {
    const editor = createEditor();
    editor._buildAISettingsModal();
    editor.aiPanelOpen = true;
    let refreshed = 0; let resumed = 0;
    editor._refreshAIReadiness = () => { refreshed++; };
    editor._resumeAISetup = () => { resumed++; };
    editor._requestAISettings = () => { throw new Error('Closing must not start a settings/provider operation'); };
    editor.closeAISettings();
    assert.equal(refreshed, 1);
    assert.equal(resumed, 1);
  });
});

for (const operation of ['_saveAISettings', '_clearAIKey', '_migrateAIKey']) {
  test(`${operation} refreshes previously loaded readiness even when the panel is hidden`, async () => {
    await withDom(async () => {
      const editor = createEditor();
      editor._buildAISettingsModal();
      editor.aiReadiness = {};
      let refreshed = 0;
      editor._refreshAIReadiness = () => { refreshed++; };
      editor._requestAISettings = async () => SETTINGS;
      await editor[operation]();
      assert.equal(refreshed, 1);
    });
  });
}

test('rejected stale Gemini test cannot replace the edited configuration prompt', async () => {
  await withDom(async () => {
    const editor = createEditor();
    editor._requestAISettings = async () => SETTINGS;
    await editor.openAISettings();
    let reject;
    editor._requestAISettings = () => new Promise((_resolve, fail) => { reject = fail; });
    const pending = editor._testAISettings();
    editor._aiSettingsInputs.model.value = 'gemini-new';
    editor._aiSettingsInputs.model.dispatch('input');
    reject(new Error('outdated network failure'));
    await pending;
    assert.match(editor._aiSettingsNote.textContent, /重新测试/);
    assert.equal(editor._aiSettingsNote.getAttribute('data-state'), '');
  });
});

test('keyboard focus wraps inside settings and skips hidden or disabled controls', async () => {
  await withDom(async () => {
    const editor = createEditor();
    editor._buildAISettingsModal();
    let focused = '';
    const first = { getClientRects: () => [1], focus() { focused = 'first'; } };
    const last = { getClientRects: () => [1], focus() { focused = 'last'; } };
    const hidden = { getClientRects: () => [], focus() { assert.fail('hidden control received focus'); } };
    const disabled = { disabled: true, getClientRects: () => [1], focus() { assert.fail('disabled control received focus'); } };
    editor._aiSettingsDialog.querySelectorAll = () => [hidden, first, disabled, last, hidden];
    let prevented = 0;
    const key = { key: 'Tab', shiftKey: false, preventDefault() { prevented++; } };
    document.activeElement = last;
    editor._handleAISettingsKey(key);
    assert.equal(focused, 'first');
    document.activeElement = first;
    editor._handleAISettingsKey({ ...key, shiftKey: true });
    assert.equal(focused, 'last');
    assert.equal(prevented, 2);
  });
});

test('close returns focus to the opener or visible menu button when the opener was hidden', async () => {
  await withDom(async () => {
    const editor = createEditor();
    let focused = '';
    editor._aiSettingsReturnFocus = { isConnected: true, getClientRects: () => [1], focus() { focused = 'opener'; } };
    editor.fileMenuButtonRef = { current: { focus() { focused = 'menu'; } } };
    editor.closeAISettings();
    assert.equal(focused, 'opener');
    editor._aiSettingsReturnFocus.getClientRects = () => [];
    editor.closeAISettings();
    assert.equal(focused, 'menu');
  });
});

for (const index of [0, 1, 2, 3]) {
  test(`busy settings move focus before disabling action ${index}`, async () => {
    await withDom(async () => {
      const editor = createEditor();
      editor._buildAISettingsModal();
      const action = editor._aiSettingsActionBtns[index];
      const close = findAll(editor._aiSettingsEl, 'abtn').find(button => button.textContent === '关闭');
      close.focus = () => { document.activeElement = close; };
      let disabled = false;
      Object.defineProperty(action, 'disabled', {
        get: () => disabled,
        set(value) {
          // Chromium drops keyboard focus to body when the active button is disabled.
          disabled = value;
          if (value && document.activeElement === action) document.activeElement = document.body;
        }
      });
      document.activeElement = action;
      editor._setAISettingsBusy(true);
      assert.equal(document.activeElement, close, 'Escape and Tab must still originate within the dialog');
      assert.equal(disabled, true);
      assert.notEqual(close.disabled, true);
      editor._setAISettingsBusy(false);
      assert.equal(document.activeElement, close, 'reenabling controls must not move focus again');
    });
  });
}
