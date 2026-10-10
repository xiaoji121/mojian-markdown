import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterWorkspaceDocuments, WorkspaceNavigationMethods } from '../../src/editor/workspaceNavigationMethods.ts';

test('文档搜索忽略大小写和首尾空格，支持中文，保留原始顺序且不修改输入', () => {
  const docs = [{ fileName: '非对称风险.md' }, { fileName: 'Markdown Notes.md' }, { fileName: '风险记录.md' }];
  assert.deepEqual(filterWorkspaceDocuments(docs, ' 风险 '), [docs[0], docs[2]]);
  assert.deepEqual(filterWorkspaceDocuments(docs, 'MARKDOWN'), [docs[1]]);
  assert.deepEqual(filterWorkspaceDocuments(docs, ''), docs);
  assert.deepEqual(filterWorkspaceDocuments(docs, 'none'), []);
  assert.equal(docs.length, 3);
});


test('保存状态区分浏览器草稿、未写回文件与冲突', () => {
  const status = { textContent: '', title: '' };
  const shell = { classList: { toggle() {} }, querySelectorAll: () => [], querySelector: () => status };
  const context = {
    splitRef: { current: { closest: () => shell } }, comments: [],
    saveStatusRef: { current: { textContent: '草稿已保存到此浏览器 · 10:00' } },
    localFilePath: '', fileHandle: null, dirty: true, _localFileConflict: false
  };
  WorkspaceNavigationMethods.prototype._syncWorkspaceChrome.call(context);
  assert.equal(status.textContent, '仅浏览器草稿');

  context.localFilePath = '/workspace/article.md';
  context.dirty = false;
  WorkspaceNavigationMethods.prototype._syncWorkspaceChrome.call(context);
  assert.equal(status.textContent, '已保存');
  context.dirty = true;
  WorkspaceNavigationMethods.prototype._syncWorkspaceChrome.call(context);
  assert.equal(status.textContent, '未写回文件');
  context._localFileConflict = true;
  WorkspaceNavigationMethods.prototype._syncWorkspaceChrome.call(context);
  assert.equal(status.textContent, '文件冲突');
});

test('offline recent chrome appends a visible Reconnect button', () => {
  const children: any[] = [];
  const note = { className: 'workspace-local-note', textContent: 'note' };
  const list = {
    querySelector(sel: string) {
      if (sel === '.recent-reconnect') {
        return children.find(c => String(c.className).includes('recent-reconnect')) || null;
      }
      if (sel === '.workspace-local-note') return note;
      return null;
    },
    appendChild(node: any) { children.push(node); return node; }
  };
  const statuses: string[] = [];
  const context: any = {
    _recentDocumentsOffline: true,
    _setStatus(msg: string) { statuses.push(msg); },
    refreshed: false,
    _refreshRecentDocuments() { context.refreshed = true; },
    _appendRecentReconnect: WorkspaceNavigationMethods.prototype._appendRecentReconnect,
    _renderLocalWorkspaceDocument(target: any) {
      target.appendChild({ className: 'recent-document-item is-active' });
      target.appendChild(note);
    }
  };
  const fakeButton: any = {
    className: '',
    textContent: '',
    title: '',
    type: '',
    _listener: null as null | (() => void),
    setAttribute() {},
    addEventListener(_type: string, fn: () => void) { fakeButton._listener = fn; }
  };
  const original = globalThis.document;
  (globalThis as any).document = { createElement() { return fakeButton; } };
  try {
    WorkspaceNavigationMethods.prototype._renderOfflineOrEmptyRecent.call(context, list);
    assert.ok(children.some(c => String(c.className).includes('recent-reconnect')));
    assert.equal(fakeButton.textContent, '重新连接');
    assert.match(note.textContent, /本地服务未连接/);
    fakeButton._listener?.();
    assert.equal(context.refreshed, true);
    assert.ok(statuses.some(s => s.includes('正在重新连接')));
  } finally {
    (globalThis as any).document = original;
  }
});

test('_appendRecentReconnect is idempotent and triggers refresh', () => {
  const children: any[] = [];
  const list = {
    querySelector(sel: string) {
      return children.find(c => sel === '.recent-reconnect' && String(c.className).includes('recent-reconnect')) || null;
    },
    appendChild(node: any) { children.push(node); return node; }
  };
  const context: any = {
    _setStatus() {},
    refreshed: false,
    _refreshRecentDocuments() { context.refreshed = true; }
  };
  const original = globalThis.document;
  const fakeButton: any = {
    className: '',
    textContent: '',
    title: '',
    type: '',
    _listener: null as null | (() => void),
    setAttribute() {},
    addEventListener(_type: string, fn: () => void) { fakeButton._listener = fn; }
  };
  (globalThis as any).document = { createElement() { return fakeButton; } };
  try {
    WorkspaceNavigationMethods.prototype._appendRecentReconnect.call(context, list);
    assert.equal(children.length, 1);
    assert.equal(fakeButton.textContent, '重新连接');
    fakeButton._listener?.();
    assert.equal(context.refreshed, true);
    WorkspaceNavigationMethods.prototype._appendRecentReconnect.call(context, list);
    assert.equal(children.length, 1, 'second append should no-op');
  } finally {
    (globalThis as any).document = original;
  }
});
