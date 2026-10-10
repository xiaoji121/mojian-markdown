import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectorMethods } from '../../src/editor/connectorMethods.ts';

type FetchCall = { url: string; body: Record<string, unknown> };

function createEditor(overrides: Record<string, unknown> = {}) {
  const editor = Object.create(ConnectorMethods.prototype);
  return Object.assign(editor, {
    agentBridgeEnabled: true,
    fileName: '技术方案.md',
    bridgeDocumentId: 'doc-1',
    statuses: [] as string[],
    toasts: [] as Array<{ state: string; title: string; detail: string }>,
    opened: [] as string[],
    _setStatus(msg: string) { this.statuses.push(msg); },
    _showPublishToast(state: string, title: string, detail: string) {
      this.toasts.push({ state, title, detail });
    },
    _documentPayload: () => ({ fileName: '技术方案.md', content: '# 方案' }),
    _flushBridgeSync: async () => {},
    _openExternal(url: string) { this.opened.push(url); },
    ...overrides
  });
}

function stubFetch(reply: (call: FetchCall) => { ok: boolean; payload: unknown }) {
  const calls: FetchCall[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    const call = { url: String(url), body: JSON.parse(init?.body || '{}') };
    calls.push(call);
    const { ok, payload } = reply(call);
    return { ok, json: async () => payload };
  }) as unknown as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

test('发布到飞书：先冲刷同步，再带 documentId 请求 /api/publish', async () => {
  const flushed: number[] = [];
  const editor = createEditor({ _flushBridgeSync: async () => { flushed.push(1); } });
  const { calls, restore } = stubFetch(() => ({
    ok: true,
    payload: { ok: true, target: 'feishu', label: '飞书', url: 'https://x.feishu.cn/docx/abc' }
  }));
  try {
    await editor.publishToFeishu();
  } finally {
    restore();
  }

  assert.equal(flushed.length, 1, '发布前应先把未落盘的编辑同步进工作区');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/publish$/);
  assert.equal(calls[0].body.target, 'feishu');
  assert.equal(calls[0].body.documentId, 'doc-1');
  assert.ok(editor.statuses.some((text: string) => text.includes('飞书')));
  assert.ok(editor.statuses.some((text: string) => text.includes('浏览器打开')));
  assert.deepEqual(editor.lastPublication, {
    target: 'feishu', label: '飞书', url: 'https://x.feishu.cn/docx/abc'
  });
});

test('发布到钉钉：未登记进工作区时改带 document 负载', async () => {
  const editor = createEditor({ bridgeDocumentId: null });
  const { calls, restore } = stubFetch(() => ({
    ok: true,
    payload: { ok: true, target: 'dingtalk', label: '钉钉', url: 'https://alidocs.dingtalk.com/i/nodes/x' }
  }));
  try {
    await editor.publishToDingtalk();
  } finally {
    restore();
  }

  assert.equal(calls[0].body.target, 'dingtalk');
  assert.equal(calls[0].body.documentId, undefined);
  assert.deepEqual(calls[0].body.document, { fileName: '技术方案.md', content: '# 方案' });
});

test('发布过程中立即显示显眼提示，成功后复制链接并自动打开', async () => {
  const editor = createEditor();
  const copied: string[] = [];
  editor._copyText = async (text: string) => { copied.push(text); return true; };
  const { restore } = stubFetch(() => ({
    ok: true, payload: { ok: true, target: 'feishu', label: '飞书', url: 'https://x.feishu.cn/docx/abc' }
  }));
  try {
    await editor.publishToFeishu();
  } finally {
    restore();
  }

  assert.deepEqual(copied, ['https://x.feishu.cn/docx/abc'], '链接直接进剪贴板，省一步手工复制');
  assert.deepEqual(editor.opened, ['https://x.feishu.cn/docx/abc'], '上传完成后直接在浏览器打开');
  assert.equal(editor.toasts[0].state, 'loading');
  assert.match(editor.toasts[0].title, /正在上传到飞书文档/);
  assert.equal(editor.toasts.at(-1)?.state, 'success');
  assert.match(editor.toasts.at(-1)?.title || '', /上传成功/);
  assert.match(editor.toasts.at(-1)?.detail || '', /浏览器打开/);
  assert.match(editor.toasts.at(-1)?.detail || '', /链接.*复制/);
});

test('发布失败时原样透出后端错误，不谎报成功', async () => {
  const editor = createEditor();
  const { restore } = stubFetch(() => ({
    ok: false, payload: { error: '未找到 lark-cli。请先安装并登录飞书 CLI' }
  }));
  try {
    await editor.publishToFeishu();
  } finally {
    restore();
  }

  assert.ok(editor.statuses.some((text: string) => text.includes('未找到 lark-cli')));
  assert.ok(!editor.statuses.some((text: string) => text.includes('已发布')));
  assert.ok(!editor.lastPublication, '失败不该记下发布记录');
  assert.equal(editor.toasts.at(-1)?.state, 'error');
  assert.match(editor.toasts.at(-1)?.title || '', /上传失败/);
});

test('后端建了文档但没解析出链接时，如实提示去云端查看', async () => {
  const editor = createEditor();
  const { restore } = stubFetch(() => ({
    ok: true, payload: { ok: true, target: 'feishu', label: '飞书', url: '' }
  }));
  try {
    await editor.publishToFeishu();
  } finally {
    restore();
  }

  assert.ok(editor.statuses.some((text: string) => /未拿到链接|请到飞书/.test(text)));
});

test('空文档不发起请求', async () => {
  const editor = createEditor({ _documentPayload: () => ({ fileName: 'a.md', content: '   ' }) });
  const { calls, restore } = stubFetch(() => ({ ok: true, payload: {} }));
  try {
    await editor.publishToFeishu();
  } finally {
    restore();
  }

  assert.equal(calls.length, 0);
  assert.ok(editor.statuses.some((text: string) => text.includes('没有内容')));
});

test('发布中不重复触发', async () => {
  const editor = createEditor();
  let resolveFetch: (() => void) | null = null;
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise<void>((resolve) => { resolveFetch = resolve; });
    return { ok: true, json: async () => ({ ok: true, target: 'feishu', label: '飞书', url: 'https://x/1' }) };
  }) as unknown as typeof fetch;
  try {
    const first = editor.publishToFeishu();
    await editor.publishToDingtalk();
    assert.equal(calls, 1, '第一次发布还没结束，第二次应被拦下');
    resolveFetch?.();
    await first;
  } finally {
    globalThis.fetch = previous;
  }
});

test('官网版（无本地 Agent Bridge）不提供发布', async () => {
  const editor = createEditor({ agentBridgeEnabled: false });
  const { calls, restore } = stubFetch(() => ({ ok: true, payload: {} }));
  try {
    await editor.publishToFeishu();
  } finally {
    restore();
  }

  assert.equal(calls.length, 0);
});

test('连接器不可用时菜单按钮置灰并用 title 说明原因', () => {
  const feishu = { dataset: { target: 'feishu' }, disabled: false, title: '', classList: { toggle() {} } };
  const dingtalk = { dataset: { target: 'dingtalk' }, disabled: false, title: '', classList: { toggle() {} } };
  const editor = createEditor({
    fileMenuRef: { current: { querySelectorAll: () => [feishu, dingtalk] } }
  });

  editor._applyConnectorCapabilities({
    feishu: { available: false, reason: '未安装 lark-cli' },
    dingtalk: { available: true, reason: '' }
  });

  assert.equal(feishu.disabled, true);
  assert.equal(feishu.title, '未安装 lark-cli');
  assert.equal(dingtalk.disabled, false);
  assert.match(dingtalk.title, /上传到钉钉云盘/);
});

test('无 Bridge 时刷新连接器直接标不可用，并写入设置页说明', async () => {
  const statuses: Record<string, { textContent: string; classList: { toggle(name: string, on: boolean): void } }> = {};
  const rows = ['feishu', 'dingtalk'].map((target) => {
    const state = { textContent: '', classList: { toggle() {} } };
    statuses[target] = state;
    return {
      classList: {
        toggled: {} as Record<string, boolean>,
        toggle(name: string, on: boolean) { this.toggled[name] = on; }
      },
      querySelector(sel: string) {
        if (sel === '[data-integration-name]') return { textContent: '' };
        if (sel === '[data-integration-status]') return state;
        return null;
      }
    };
  });
  const root = {
    querySelector: () => ({ textContent: '' }),
    querySelectorAll(sel: string) {
      if (sel === '[data-integration-target]') return [];
      return [];
    }
  };
  // Minimal getElementById stub
  const original = globalThis.document;
  (globalThis as any).document = {
    getElementById(id: string) {
      if (id !== 'settings-integrations') return null;
      return {
        querySelector(sel: string) {
          if (sel === '[data-integrations-note]') return { textContent: '' };
          const m = String(sel).match(/data-integration-target="(\w+)"/);
          if (m) return rows[['feishu', 'dingtalk'].indexOf(m[1])];
          return null;
        },
        querySelectorAll(sel: string) {
          if (sel === '[data-integration-status]') return rows.map(r => r.querySelector('[data-integration-status]'));
          return [];
        }
      };
    }
  };
  const { calls, restore } = stubFetch(() => ({ ok: true, payload: {} }));
  const editor = createEditor({ agentBridgeEnabled: false, fileMenuRef: { current: null } });
  try {
    await editor._refreshConnectorCapabilities();
    assert.equal(calls.length, 0, 'no Bridge should not hit /api/connectors');
    assert.match(statuses.feishu.textContent, /需要桌面版或本地 Agent Bridge/);
    assert.match(statuses.dingtalk.textContent, /需要桌面版或本地 Agent Bridge/);
  } finally {
    restore();
    (globalThis as any).document = original;
  }
});
