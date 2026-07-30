import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TranslateMethods } from '../../src/editor/translateMethods.ts';
import { createStubElement } from '../helpers/dom.ts';

function collectTexts(el: { textContent?: string; children?: unknown[] }, out: string[] = []) {
  if (el.textContent) out.push(el.textContent);
  (el.children || []).forEach((child) => collectTexts(child as typeof el, out));
  return out;
}

function findByClass(
  el: { className?: string; children?: unknown[] },
  cls: string
): (ReturnType<typeof createStubElement> & { className?: string }) | null {
  if ((el.className || '').split(' ').includes(cls)) return el as never;
  for (const child of el.children || []) {
    const found = findByClass(child as never, cls);
    if (found) return found;
  }
  return null;
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => index < chunks.length
          ? { done: false, value: encoder.encode(chunks[index++]) }
          : { done: true, value: undefined }
      })
    }
  };
}

function withDom(run: (body: ReturnType<typeof createStubElement>) => Promise<void>) {
  const previousDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const body = createStubElement();
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement(), body },
    configurable: true
  });
  Object.defineProperty(globalThis, 'window', {
    value: { getSelection: () => null },
    configurable: true
  });
  return run(body).finally(() => {
    if (previousDoc) Object.defineProperty(globalThis, 'document', previousDoc);
    else delete (globalThis as Record<string, unknown>).document;
    if (previousWin) Object.defineProperty(globalThis, 'window', previousWin);
    else delete (globalThis as Record<string, unknown>).window;
  });
}

function createTranslator() {
  const editor = Object.create(TranslateMethods.prototype);
  return Object.assign(editor, {
    agentBridgeEnabled: true,
    _pending: { quote: 'hello world', occ: 0 },
    selBarRef: { current: { style: { left: '120px', top: '80px', display: 'flex' } } },
    statuses: [] as string[],
    _setStatus(text: string) { (this as { statuses: string[] }).statuses.push(text); },
    _copy() {},
    openAISettings() {}
  });
}

test('translateSel 把译文流式渲染到浮层', async () => {
  await withDom(async (body) => {
    const requests: Array<[string, string]> = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
      requests.push([String(input), String(init?.body || '')]);
      return sseResponse([
        'event: meta\ndata: {"provider":"gemini","model":"gemini-2.5-flash"}\n\n',
        'event: delta\ndata: {"text":"你好"}\n\n',
        'event: delta\ndata: {"text":"世界"}\n\n'
      ]);
    }) as typeof fetch;
    try {
      const editor = createTranslator();

      await editor.translateSel();

      assert.equal(requests.length, 1);
      assert.match(requests[0][0], /\/api\/translate/);
      assert.match(requests[0][1], /hello world/);
      const popover = findByClass(body, 'translate-popover');
      assert.ok(popover, '译文浮层应挂到 body');
      assert.ok(collectTexts(popover!).some((text) => text.includes('你好世界')), '浮层应包含完整译文');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('未配置 Key 的报错在浮层里给出去配置入口', async () => {
  await withDom(async (body) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => sseResponse([
      'event: error\ndata: {"message":"尚未配置 Gemini API Key，请在 AI 面板的设置里填写。"}\n\n'
    ])) as typeof fetch;
    try {
      const editor = createTranslator();
      let opened = 0;
      editor.openAISettings = () => { opened += 1; };

      await editor.translateSel();

      const popover = findByClass(body, 'translate-popover');
      assert.ok(collectTexts(popover!).some((text) => text.includes('尚未配置 Gemini API Key')));
      const configButton = findByClass(popover!, 'translate-open-settings');
      assert.ok(configButton, '应提供去配置按钮');
      configButton!.dispatch('click');
      assert.equal(opened, 1);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('Bridge 未启用时提示且不发请求', async () => {
  await withDom(async () => {
    let fetched = 0;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => { fetched += 1; throw new Error('no'); }) as typeof fetch;
    try {
      const editor = createTranslator();
      editor.agentBridgeEnabled = false;

      await editor.translateSel();

      assert.equal(fetched, 0);
      assert.ok(editor.statuses.length >= 1);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
