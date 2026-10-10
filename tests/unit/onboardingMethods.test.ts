import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OnboardingMethods } from '../../src/editor/onboardingMethods.ts';
import { CommentMethods } from '../../src/editor/commentMethods.ts';
import { setLocale, getLocale } from '../../src/editor/i18n.ts';
import { ND_COMPLETE_KEY } from '../../src/editor/onboarding.ts';

test('批注空态主辅文案无 AI 字样（N3）', () => {
  const previous = getLocale();
  const previousDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(tag: string) {
        const el: Record<string, unknown> = {
          tagName: tag.toUpperCase(),
          className: '',
          textContent: '',
          children: [] as unknown[],
          setAttribute(k: string, v: string) { (this as any)['attr:' + k] = v; },
          getAttribute(k: string) { return (this as any)['attr:' + k] ?? null; },
          appendChild(child: unknown) { (this.children as unknown[]).push(child); return child; },
          addEventListener() {}
        };
        return el;
      }
    }
  });
  const list = {
    children: [] as unknown[],
    appendChild(node: unknown) { this.children.push(node); this.child = node; return node; },
    child: null as unknown
  };
  try {
    setLocale('zh-CN');
    const editor = Object.create(OnboardingMethods.prototype);
    editor._renderNdCommentsEmpty(list);
    const wrap = list.child as any;
    assert.equal(wrap?.getAttribute?.('data-nd-empty'), '1');
    const collect = (node: any): string => {
      if (!node) return '';
      const kids = (node.children || []).map(collect).join('');
      return (node.textContent || '') + kids;
    };
    const text = collect(wrap);
    assert.match(text, /预览/);
    assert.match(text, /马克笔|写想法/);
    assert.match(text, /不会写回源文/);
    assert.doesNotMatch(text, /AI|人工智能/);
  } finally {
    setLocale(previous);
    if (previousDoc) Object.defineProperty(globalThis, 'document', previousDoc);
    else delete (globalThis as { document?: unknown }).document;
  }
});

test('S0 将新建降为 secondary（N9）', () => {
  const newBtn = { classList: { primary: true, secondary: false,
    toggle(name: string, on: boolean) {
      if (name === 'primary') this.primary = on;
      if (name === 'secondary') this.secondary = on;
    }
  } };
  const editor = Object.create(OnboardingMethods.prototype);
  Object.assign(editor, {
    _startedWithSample: true,
    _ndComplete: false,
    fileHandle: null,
    localFilePath: null,
    documentSidebarRef: {
      current: {
        querySelector(sel: string) {
          if (sel.includes('workspace-file-actions')) return newBtn;
          return null;
        }
      }
    }
  });
  editor._syncNdNewButton();
  assert.equal(newBtn.classList.primary, false);
  assert.equal(newBtn.classList.secondary, true);
});

test('≥1 批注 + 导出后记 complete 并一次庆祝（N7）', () => {
  const store = new Map<string, string>();
  const previousLS = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.has(k) ? store.get(k)! : null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); }
    }
  });
  const statuses: string[] = [];
  try {
    const editor = Object.create(OnboardingMethods.prototype);
    Object.assign(editor, {
      _ndComplete: false,
      _ndSessionAnnotated: true,
      _ndSessionExported: false,
      comments: [{ id: '1' }],
      _setStatus(msg: string) { statuses.push(msg); },
      _dismissNdFirstHighlight() {},
      _syncNdNewButton() {}
    });
    assert.equal(editor._noteNdExported(), true);
    assert.equal(editor._ndComplete, true);
    assert.equal(store.get(ND_COMPLETE_KEY), '1');
    assert.equal(statuses.length, 1);
    assert.match(statuses[0], /批注已带走|备份包/);
    // second export does not celebrate again
    assert.equal(editor._noteNdExported(), false);
    assert.equal(statuses.length, 1);
  } finally {
    if (previousLS) Object.defineProperty(globalThis, 'localStorage', previousLS);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('划线成功反馈用短 toast（N4）', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { getSelection: () => null }
  });
  const statuses: string[] = [];
  try {
    const editor = Object.create(CommentMethods.prototype);
    Object.assign(editor, {
      comments: [],
      selBarRef: { current: null },
      commentsRef: { current: { style: {}, querySelector() { return null; } } },
      commentListRef: { current: null },
      commentCountRef: { current: null },
      previewCommentCountRef: { current: null },
      _pending: { quote: '一句', occ: 0, start: 0 },
      _persist() {},
      _renderPreview() {},
      _renderComments() {},
      _openPanel() {},
      _focusComment() {},
      _noteNdAnnotated() {},
      _setStatus(msg: string) { statuses.push(msg); }
    });
    editor.markMarker();
    assert.equal(statuses[0], '✓ 已划线');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete (globalThis as { window?: unknown }).window;
  }
});
