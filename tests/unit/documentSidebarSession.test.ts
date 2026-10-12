import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceNavigationMethods } from '../../src/editor/workspaceNavigationMethods.ts';
import { BridgeMethods } from '../../src/editor/bridgeMethods.ts';
import { createStubElement, createRef } from '../helpers/dom.ts';

function harness() {
  const sidebar: any = createStubElement();
  const reopen: any = createStubElement();
  const close: any = createStubElement();
  let mobile = false;
  const source = { value: '# Keep', selectionStart: 3, selectionEnd: 5, scrollTop: 70 };
  const preview = { scrollTop: 430 };
  sidebar.contains = (element: any) => element === close;
  sidebar.querySelector = () => close;
  close.focus = () => { doc.activeElement = close; };
  reopen.focus = (options: any) => { doc.activeElement = reopen; reopen.options = options; };
  const doc: any = { activeElement: close, querySelector: () => reopen };
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  (globalThis as any).document = doc;
  (globalThis as any).window = { matchMedia: () => ({ matches: mobile }) };
  const context: any = { documentSidebarRef: createRef(sidebar), sourceRef: createRef(source), previewRef: createRef(preview) };
  for (const name of ['_syncDocumentSidebar', 'toggleDocumentSidebar', 'closeDocumentSidebar']) {
    context[name] = WorkspaceNavigationMethods.prototype[name] ?? BridgeMethods.prototype[name];
  }
  return { context, sidebar, reopen, close, doc, source, preview, mobile: (value: boolean) => { mobile = value; },
    restore() { (globalThis as any).document = originalDocument; (globalThis as any).window = originalWindow; } };
}

test('desktop collapse and reopen return focus to visible controls without changing document position', () => {
  const h = harness();
  try {
    h.context.closeDocumentSidebar();
    assert.equal(h.sidebar.classList.contains('is-collapsed'), true);
    assert.equal(h.doc.activeElement, h.reopen);
    assert.equal(h.reopen.getAttribute('aria-expanded'), 'false');
    assert.equal(h.sidebar.inert, true);
    h.context.toggleDocumentSidebar();
    assert.equal(h.sidebar.classList.contains('is-collapsed'), false);
    assert.equal(h.doc.activeElement, h.close);
    assert.equal(h.sidebar.inert, false);
    assert.equal(h.preview.scrollTop, 430);
    assert.deepEqual(h.source, { value: '# Keep', selectionStart: 3, selectionEnd: 5, scrollTop: 70 });
  } finally { h.restore(); }
});

test('mobile drawer open/close does not overwrite the last desktop expanded preference', () => {
  const h = harness();
  try {
    h.context._sidebarExplicitOpen = true;
    h.mobile(true);
    h.context.toggleDocumentSidebar();
    h.context.closeDocumentSidebar();
    assert.equal(h.context._sidebarExplicitOpen, true);
    h.mobile(false);
    h.context._syncDocumentSidebar();
    assert.equal(h.sidebar.classList.contains('is-collapsed'), false);
    h.context.closeDocumentSidebar();
    h.mobile(true);
    h.context.toggleDocumentSidebar();
    h.context.closeDocumentSidebar();
    h.mobile(false);
    h.context._syncDocumentSidebar();
    assert.equal(h.sidebar.classList.contains('is-collapsed'), true);
  } finally { h.restore(); }
});

test('sidebar stays inert during focus mode resize without changing the desktop choice', () => {
  const h = harness();
  try {
    h.context.previewFullscreen = true;
    h.context._sidebarExplicitOpen = true;
    h.context._syncDocumentSidebar();
    assert.equal(h.sidebar.inert, true);
    assert.equal(h.context._sidebarExplicitOpen, true);
    h.context.previewFullscreen = false;
    h.context._syncDocumentSidebar();
    assert.equal(h.sidebar.inert, false);
  } finally { h.restore(); }
});
