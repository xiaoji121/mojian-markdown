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
    value: { getSelection: () => null, innerWidth: 1440, innerHeight: 900 },
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

test('浮层超出视口时收拢回视口内', async () => {
  await withDom(async (body) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => sseResponse(['event: delta\ndata: {"text":"你好"}\n\n'])) as typeof fetch;
    try {
      const editor = createTranslator();
      await editor.translateSel();

      const popover = findByClass(body, 'translate-popover')! as never as {
        offsetWidth: number; offsetHeight: number; style: Record<string, string>;
      };
      popover.offsetWidth = 400;
      popover.offsetHeight = 300;
      popover.style.left = '1300px';
      popover.style.top = '850px';

      editor._clampTranslatePopover();

      assert.equal(popover.style.left, '1032px', '右侧越界应收拢（1440-400-8）');
      assert.equal(popover.style.top, '592px', '底部越界应上移（900-300-8）');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('流式追加译文的过程中随内容增长收拢位置', async () => {
  await withDom(async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => sseResponse([
      'event: delta\ndata: {"text":"第一段"}\n\n',
      'event: delta\ndata: {"text":"第二段"}\n\n'
    ])) as typeof fetch;
    try {
      const editor = createTranslator();
      let clamped = 0;
      editor._clampTranslatePopover = () => { clamped += 1; };

      await editor.translateSel();

      assert.ok(clamped >= 2, '每次追加译文都应重新收拢，实际 ' + clamped);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test('浮层可通过标题栏拖拽移动，松手后停止跟随', async () => {
  await withDom(async (body) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => sseResponse(['event: delta\ndata: {"text":"你好"}\n\n'])) as typeof fetch;
    try {
      const editor = createTranslator();
      await editor.translateSel();
      const popover = findByClass(body, 'translate-popover')! as never as { style: Record<string, string> };
      // 初始位置来自划词工具条：left 120px / top 80px

      editor._onTranslateDragStart({ clientX: 200, clientY: 100, preventDefault() {} });
      editor._onTranslateDragMove({ clientX: 260, clientY: 180 });
      assert.equal(popover.style.left, '180px');
      assert.equal(popover.style.top, '160px');

      editor._onTranslateDragEnd();
      editor._onTranslateDragMove({ clientX: 900, clientY: 700 });
      assert.equal(popover.style.left, '180px', '松手后不再跟随');
      assert.equal(popover.style.top, '160px');
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
