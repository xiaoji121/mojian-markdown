import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeMethods } from '../../src/editor/bridgeMethods.ts';
import { createStubElement } from '../helpers/dom.ts';

// 每机本地钉选 + 分区侧栏：固定文档存 localStorage（每台机器各自配置，不进同步工作区），
// 固定区永远整段展示、最近区默认折叠、本会话打开过的文档始终保留。逻辑见 bridgeMethods.ts。

function collectTexts(el: { textContent?: string; children?: unknown[] }, out: string[] = []) {
  if (el.textContent) out.push(el.textContent);
  (el.children || []).forEach((child) => collectTexts(child as typeof el, out));
  return out;
}

function findByClass(
  el: { className?: string; children?: unknown[] },
  cls: string
): (Record<string, unknown> & { children?: unknown[] }) | null {
  if (el.className === cls) return el as never;
  for (const child of el.children || []) {
    const found = findByClass(child as typeof el, cls);
    if (found) return found;
  }
  return null;
}

// className 可能带附加修饰类（如 is-pinned / is-active），按空白分词做包含匹配。
function findByClassLoose(
  el: { className?: string; children?: unknown[] },
  cls: string
): (Record<string, unknown> & { children?: unknown[] }) | null {
  if (String(el.className || '').split(' ').includes(cls)) return el as never;
  for (const child of el.children || []) {
    const found = findByClassLoose(child as typeof el, cls);
    if (found) return found;
  }
  return null;
}

function findAllByClassLoose(
  el: { className?: string; children?: unknown[] },
  cls: string,
  out: Array<Record<string, unknown> & { children?: unknown[] }> = []
) {
  if (String(el.className || '').split(' ').includes(cls)) out.push(el as never);
  for (const child of el.children || []) findAllByClassLoose(child as typeof el, cls, out);
  return out;
}

function pinEditor(recentDocuments: unknown[], extra: Record<string, unknown> = {}) {
  const list = createStubElement();
  const editor = Object.create(BridgeMethods.prototype);
  Object.assign(editor, {
    documentListRef: { current: list },
    documentCountRef: { current: createStubElement() },
    bridgeDocumentId: null,
    activeAnswerRequestId: null,
    pinnedDocumentIds: new Set<string>(),
    _sessionOpenedIds: new Set<string>(),
    recentListExpanded: false,
    recentDocuments,
    openRecentDocument() {},
    openAnswerDocument() {},
    deleteRecentDocument() {},
    _savePinnedIds() {},
    ...extra
  });
  return { editor, list };
}

function withStubDocument(run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => createStubElement(), body: createStubElement() },
    configurable: true
  });
  try { run(); } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as Record<string, unknown>).document;
  }
}

function manyDocs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    documentId: 'doc-' + i, fileName: 'doc-' + i + '.md',
    updatedAt: '2026-08-' + String(20 - i).padStart(2, '0') + 'T08:00:00.000Z',
    annotationCount: 0, questionCount: 0, answerDocuments: []
  }));
}

test('固定的文档置于「已固定」分区并排在最近文档之前', () => {
  withStubDocument(() => {
    const { editor, list } = pinEditor([
      { documentId: 'new', fileName: 'new.md', updatedAt: '2026-08-05T10:00:00.000Z', annotationCount: 0, questionCount: 0, answerDocuments: [] },
      { documentId: 'old', fileName: 'old.md', updatedAt: '2026-07-01T10:00:00.000Z', annotationCount: 0, questionCount: 0, answerDocuments: [] }
    ], { pinnedDocumentIds: new Set(['old']) });

    editor._renderRecentDocuments();

    const label = findByClass(list, 'recent-section-label');
    assert.ok(label && String(label.textContent).startsWith('已固定'), '固定区应有「已固定」标签');
    const names = collectTexts(list).filter((t) => t === 'new.md' || t === 'old.md');
    assert.deepEqual(names, ['old.md', 'new.md'], '被固定的旧文档应排在最近的新文档之前');
    const pin = findByClassLoose(list, 'recent-document-pin');
    assert.equal(pin!.className, 'recent-document-pin is-pinned');
    assert.equal(pin!.getAttribute!('aria-pressed'), 'true');
  });
});

test('点击固定按钮写入 localStorage 并即时切换为固定态', () => {
  const store: Record<string, string> = {};
  const prevLs = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = v; } },
    configurable: true
  });
  try {
    withStubDocument(() => {
      const { editor, list } = pinEditor([
        { documentId: 'doc-1', fileName: 'note.md', updatedAt: '2026-08-05T08:00:00.000Z', annotationCount: 0, questionCount: 0, answerDocuments: [] }
      ], { _savePinnedIds: BridgeMethods.prototype._savePinnedIds });

      editor._renderRecentDocuments();
      const pin = findByClassLoose(list, 'recent-document-pin');
      assert.equal(pin!.getAttribute!('aria-pressed'), 'false');
      pin!.dispatch!('click');

      assert.ok(editor.pinnedDocumentIds.has('doc-1'), '点击后应记为已固定');
      assert.deepEqual(JSON.parse(store['md-editor-pinned-docs']), ['doc-1'], '固定集应持久化到 localStorage');
      const after = findByClassLoose(list, 'recent-document-pin');
      assert.equal(after!.getAttribute!('aria-pressed'), 'true', '重渲染后按钮应为固定态');
      assert.equal(after!.textContent, '★');
    });
  } finally {
    if (prevLs) Object.defineProperty(globalThis, 'localStorage', prevLs);
    else delete (globalThis as Record<string, unknown>).localStorage;
  }
});

test('最近文档超过上限时折叠，展开后全部可见', () => {
  withStubDocument(() => {
    const { editor, list } = pinEditor(manyDocs(10));

    editor._renderRecentDocuments();
    assert.equal(findAllByClassLoose(list, 'recent-document-item').length, 8, '默认只展示最近 8 篇');
    const more = findByClass(list, 'recent-list-more');
    assert.ok(more && String(more.textContent).includes('2'), '折叠时应提示还有 2 篇');

    editor.toggleRecentListExpanded();
    assert.equal(findAllByClassLoose(list, 'recent-document-item').length, 10, '展开后全部可见');
    assert.equal(findByClass(list, 'recent-list-more')!.textContent, '收起');
  });
});

test('本会话打开过的旧文档即使超出上限也保留在最近区', () => {
  withStubDocument(() => {
    // doc-9 是最旧的，排在第 10 位，正常会被折叠
    const { editor, list } = pinEditor(manyDocs(10), { _sessionOpenedIds: new Set(['doc-9']) });

    editor._renderRecentDocuments();

    assert.ok(collectTexts(list).includes('doc-9.md'), '本会话打开过的文档应始终保留在最近区');
  });
});
