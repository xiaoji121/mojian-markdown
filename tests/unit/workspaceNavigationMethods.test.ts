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


test('保存状态识别桌面文件路径，未写入和冲突状态优先显示', () => {
  const status = { textContent: '', title: '' };
  const shell = { classList: { toggle() {} }, querySelectorAll: () => [], querySelector: () => status };
  const context = {
    splitRef: { current: { closest: () => shell } }, comments: [],
    saveStatusRef: { current: { textContent: '已保存到文件' } },
    localFilePath: '/workspace/article.md', dirty: false, _localFileConflict: false
  };
  WorkspaceNavigationMethods.prototype._syncWorkspaceChrome.call(context);
  assert.equal(status.textContent, '已保存');
  context.dirty = true;
  WorkspaceNavigationMethods.prototype._syncWorkspaceChrome.call(context);
  assert.equal(status.textContent, '未保存到文件');
  context._localFileConflict = true;
  WorkspaceNavigationMethods.prototype._syncWorkspaceChrome.call(context);
  assert.equal(status.textContent, '文件冲突');
});
