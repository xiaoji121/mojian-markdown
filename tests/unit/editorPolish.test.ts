import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeMethods } from '../../src/editor/bridgeMethods.ts';
import { ViewMethods } from '../../src/editor/viewMethods.ts';
import { createStubElement, createRef } from '../helpers/dom.ts';

test('空侧栏自动收起，用户可主动展开，刷新列表不覆盖用户选择', () => {
  const sidebar = createStubElement();
  const editor = Object.assign(Object.create(BridgeMethods.prototype), {
    documentSidebarRef: createRef(sidebar), recentDocuments: []
  });
  editor._syncDocumentSidebar();
  assert.equal(sidebar.classList.contains('is-collapsed'), true);
  editor.toggleDocumentSidebar();
  assert.equal(sidebar.classList.contains('is-collapsed'), false);
  editor._syncDocumentSidebar();
  assert.equal(sidebar.classList.contains('is-collapsed'), false);
  editor.closeDocumentSidebar();
  editor.recentDocuments = [{ documentId: 'one' }];
  editor._syncDocumentSidebar();
  assert.equal(sidebar.classList.contains('is-collapsed'), true);
});

test('草稿保存失败时不显示保存成功，仍尝试写回关联文件', () => {
  let status = '', wrote = false;
  ViewMethods.prototype._autosave.call({
    sourceRef: createRef({ value: '内容' }), _persist: () => false,
    _setStatus: (text) => { status = text; },
    _maybeWriteThroughLocalFile: () => { wrote = true; }
  });
  assert.match(status, /草稿保存失败/);
  assert.equal(wrote, true);
});
