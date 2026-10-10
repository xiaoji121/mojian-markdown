import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutlineMethods } from '../../src/editor/outlineMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

function heading(tag: string, text: string) {
  const el = createStubElement() as any;
  el.tagName = tag.toUpperCase();
  el.textContent = text;
  el.id = '';
  return el;
}

function withDocumentCreateElement(run: () => void) {
  const original = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const el = createStubElement() as any;
      el.style = {
        ...el.style,
        setProperty(name: string, value: string) { el.style[name] = value; }
      };
      return el;
    }
  } as any;
  try { run(); }
  finally { globalThis.document = original; }
}

test('大纲侧栏渲染 H1–H6 缩进树', () => {
  withDocumentCreateElement(() => {
    const tree = createStubElement() as any;
    const h1 = heading('h1', '产品复盘');
    const h2 = heading('h2', '做对了什么');
    const h3 = heading('h3', '用户反馈');
    const preview = createStubElement() as any;
    preview.querySelectorAll = () => [h1, h2, h3];

    const context: any = {
      previewRef: createRef(preview),
      outlineTreeRef: createRef(tree),
      _syncActiveOutlineItem() {},
      _outlineSlug: OutlineMethods.prototype._outlineSlug,
      _outlineTreeItem: OutlineMethods.prototype._outlineTreeItem,
      _jumpToOutlineHeading() {}
    };

    OutlineMethods.prototype._renderOutline.call(context);

    assert.equal(tree.children.length, 3);
    assert.equal(tree.children[0].dataset.outlineLevel, '1');
    assert.equal(tree.children[1].dataset.outlineLevel, '2');
    assert.equal(tree.children[2].dataset.outlineLevel, '3');
    assert.equal(tree.children[0].textContent, '产品复盘');
    assert.equal(tree.children[2].dataset.outlineTitle, '用户反馈');
    assert.match(h1.id, /^outline-/);
  });
});

test('无标题时大纲侧栏显示空状态文案', () => {
  withDocumentCreateElement(() => {
    const tree = createStubElement() as any;
    const preview = createStubElement() as any;
    preview.querySelectorAll = () => [];
    const context: any = {
      previewRef: createRef(preview),
      outlineTreeRef: createRef(tree),
      _syncActiveOutlineItem() {}
    };
    OutlineMethods.prototype._renderOutline.call(context);
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].className, 'outline-tree-empty');
    assert.match(tree.children[0].textContent, /暂无标题/);
  });
});

test('打开大纲侧栏会关闭批注与 AI 面板', () => {
  const aside = createStubElement() as any;
  aside.style = {};
  const comments = createStubElement() as any;
  comments.style = { display: 'flex' };
  const ai = createStubElement() as any;
  ai.style = { display: 'flex' };
  const context: any = {
    outlineSidebarRef: createRef(aside),
    commentsRef: createRef(comments),
    aiPanelRef: createRef(ai),
    outlinePanelOpen: false,
    panelOpen: true,
    aiPanelOpen: true,
    commentsPanelWidth: 360,
    aiPanelWidth: 480,
    _applyOutlinePanelWidth(width: number) {
      this.commentsPanelWidth = width;
      aside.style.width = width + 'px';
    },
    _renderOutline() { this.rendered = true; },
    _syncFullscreenLayout() { this.synced = true; }
  };
  OutlineMethods.prototype._openOutlinePanel.call(context, true);
  assert.equal(context.outlinePanelOpen, true);
  assert.equal(aside.style.display, 'flex');
  assert.equal(context.panelOpen, false);
  assert.equal(comments.style.display, 'none');
  assert.equal(context.aiPanelOpen, false);
  assert.equal(ai.style.display, 'none');
  assert.equal(context.rendered, true);
  assert.equal(context.synced, true);
});
