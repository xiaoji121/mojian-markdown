import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceMenuMethods } from '../../src/editor/workspaceMenuMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

test('在更多入口按向上键，焦点到最后一个可用菜单项', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const button = createStubElement(), menu = createStubElement();
  let focused = -1;
  const items = [0, 1, 2].map((index) => ({
    disabled: false, getClientRects: () => [{}], focus: () => { focused = index; }
  }));
  menu.querySelectorAll = () => items;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: button } });
  try {
    WorkspaceMenuMethods.prototype._handleWorkspaceMenuKey.call({
      fileMenuRef: createRef(menu), fileMenuButtonRef: createRef(button), toggleFileMenu() {}
    }, { key: 'ArrowUp', preventDefault() {} });
    assert.equal(focused, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete (globalThis as any).document;
  }
});

test('文件菜单开合同步 is-open 与 aria-expanded', () => {
  const docListeners = new Map<string, unknown[]>();
  (globalThis as { document?: unknown }).document = {
    addEventListener(type: string, listener: unknown) {
      docListeners.set(type, [...(docListeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: unknown) {
      docListeners.set(type, (docListeners.get(type) ?? []).filter((item) => item !== listener));
    }
  };
  try {
    const editor = Object.create(WorkspaceMenuMethods.prototype);
    const attrs = new Map<string, string>();
    const classes = new Set<string>();
    editor.fileMenuRef = {
      current: {
        classList: {
          toggle(name: string, force: boolean) { force ? classes.add(name) : classes.delete(name); },
          contains(name: string) { return classes.has(name); }
        },
        contains() { return false; }
      }
    };
    editor.fileMenuButtonRef = {
      current: {
        setAttribute(name: string, value: string) { attrs.set(name, value); },
        contains() { return false; }
      }
    };

    (editor as { toggleFileMenu: (force?: boolean) => void }).toggleFileMenu();
    assert.equal(classes.has('is-open'), true);
    assert.equal(attrs.get('aria-expanded'), 'true');
    assert.equal((docListeners.get('click') ?? []).length, 1);

    (editor as { toggleFileMenu: (force?: boolean) => void }).toggleFileMenu();
    assert.equal(classes.has('is-open'), false);
    assert.equal(attrs.get('aria-expanded'), 'false');
    assert.equal((docListeners.get('click') ?? []).length, 0);
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});
