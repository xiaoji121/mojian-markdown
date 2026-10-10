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
