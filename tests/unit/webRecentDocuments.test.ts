import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEB_RECENT_LIMIT,
  createMemoryBackend,
  idsToPrune,
  shouldRecordWebDocument,
  toRecentSummary,
  WebRecentMethods
} from '../../src/editor/webRecentDocuments.ts';

const M = WebRecentMethods.prototype as any;

function makeEditor(overrides: any = {}) {
  const source = { value: '# 文章 A\n\n正文' };
  const statuses: string[] = [];
  const editor: any = {
    agentBridgeEnabled: false,
    _recentDocumentsOffline: undefined,
    sourceRef: { current: source },
    fileName: 'a.md',
    comments: [],
    bridgeDocumentId: null,
    activeDocumentId: null,
    pinnedDocumentIds: new Set(),
    _webRecentBackend: createMemoryBackend(),
    _webRecentDelay: 0,
    _webRecentSavedState: () => null,
    renders: 0,
    _renderRecentDocuments() { editor.renders += 1; },
    _setStatus(msg: string) { statuses.push(msg); },
    statuses,
    _pinnedSet() { return editor.pinnedDocumentIds; },
    _savePinnedIds() {},
    _setFileName(name: string) { editor.fileName = name; },
    _resetEditingHistory() {},
    _detachLocalFile() { editor.fileHandle = null; },
    _renderComments() {},
    _renderPreview() {},
    _setDirty(value: boolean) { editor.dirty = value; },
    _persist() { M._webRecentTouch.call(editor); return true; },
    ...overrides
  };
  Object.getOwnPropertyNames(WebRecentMethods.prototype).forEach((name) => {
    if (name !== 'constructor' && !(name in editor)) editor[name] = M[name];
  });
  return editor;
}

test('样例文档与空白未命名稿不进入最近阅读', () => {
  assert.equal(shouldRecordWebDocument('', '未命名.md'), false);
  assert.equal(shouldRecordWebDocument('   \n', 'a.md'), false);
  assert.equal(shouldRecordWebDocument('# hi', 'a.md'), true);
});

test('超出上限时淘汰最旧的未固定文档，固定文档永不淘汰', () => {
  const records = Array.from({ length: WEB_RECENT_LIMIT + 3 }, (_, i) => ({
    documentId: 'web-' + i,
    updatedAt: new Date(2026, 0, 1, 0, i).toISOString()
  }));
  const pruned = idsToPrune(records, new Set(['web-0']), WEB_RECENT_LIMIT);
  // 33 篇里 1 篇固定，未固定的 32 篇只留 30 篇
  assert.deepEqual(pruned.sort(), ['web-1', 'web-2']);
});

test('列表摘要不携带全文，带批注数', () => {
  const summary = toRecentSummary({
    documentId: 'web-1', fileName: 'a.md', content: 'long', comments: [{}, {}], updatedAt: 'x'
  });
  assert.equal('content' in summary, false);
  assert.equal(summary.annotationCount, 2);
  assert.equal(summary.questionCount, 0);
});

test('桌面版或已连上本地服务时不启用浏览器最近阅读', () => {
  assert.equal(M._webRecentEnabled.call(makeEditor()), true);
  assert.equal(M._webRecentEnabled.call(makeEditor({ agentBridgeEnabled: true })), false);
  assert.equal(M._webRecentEnabled.call(makeEditor({ _recentDocumentsOffline: false })), false);
});

test('打开第二篇后两篇都留在列表里，按最近时间排序', async () => {
  const editor = makeEditor();
  await editor._initWebRecent();
  const firstId = editor.activeDocumentId;
  assert.match(firstId, /^web-/);

  // 模拟「打开」另一篇：所有打开路径都会先清空文档 id
  editor.bridgeDocumentId = null;
  editor.activeDocumentId = null;
  editor.fileName = 'b.md';
  editor.sourceRef.current.value = '# 文章 B';
  editor._persist();
  await editor._webRecentFlush();

  const docs = editor._webRecentList;
  assert.equal(docs.length, 2);
  assert.equal(editor._webRecentDocs().length, 2);
  assert.deepEqual(docs.map((d: any) => d.fileName).sort(), ['a.md', 'b.md']);
  assert.notEqual(editor.activeDocumentId, firstId);
});

test('从列表切回旧文档时恢复全文与批注', async () => {
  const editor = makeEditor({ comments: [{ id: 'c1', quote: '正文', note: '想法' }] });
  await editor._initWebRecent();
  const firstId = editor.activeDocumentId;

  editor.activeDocumentId = null;
  editor.fileName = 'b.md';
  editor.comments = [];
  editor.sourceRef.current.value = '# 文章 B';
  editor._persist();
  await editor._webRecentFlush();

  await editor._openWebRecentDocument(firstId);
  assert.equal(editor.fileName, 'a.md');
  assert.equal(editor.sourceRef.current.value, '# 文章 A\n\n正文');
  assert.equal(editor.comments.length, 1);
  assert.equal(editor.activeDocumentId, firstId);
  // 切走前的 B 也已经落库
  assert.equal(editor._webRecentList.length, 2);
});

test('删除当前文档后，未改动内容时不会被立刻重新登记', async () => {
  const editor = makeEditor({ _confirm: () => true });
  await editor._initWebRecent();
  const doc = editor._webRecentList[0];
  await editor._deleteWebRecentDocument(doc);
  assert.equal(editor._webRecentList.length, 0);
  assert.equal(editor.activeDocumentId, null);

  editor._persist();
  await editor._webRecentFlush();
  assert.equal(editor._webRecentList.length, 0);

  editor.sourceRef.current.value += '\n继续写';
  editor._persist();
  await editor._webRecentFlush();
  assert.equal(editor._webRecentList.length, 1);
});

test('存储不可用时退回单篇显示而不抛错', async () => {
  const broken = {
    getAll: async () => { throw new Error('no idb'); },
    get: async () => undefined, put: async () => {}, delete: async () => {}
  };
  const editor = makeEditor({ _webRecentBackend: broken });
  await editor._initWebRecent();
  assert.equal(editor._webRecentDocs(), null);
});

test('未登记的当前稿（如示例文档）作为一行显示在列表顶部，且不可删除', async () => {
  const editor = makeEditor();
  editor.sourceRef.current.value = '';
  editor.fileName = '未命名.md';
  await editor._initWebRecent();
  assert.equal(editor._webRecentList.length, 0);
  const docs = editor._webRecentDocs();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].isCurrentDraft, true);
  assert.equal(docs[0].fileName, '未命名.md');
});

test('浏览器文档 id 不占用 bridgeDocumentId，移动端批注草稿键保持按文件名', async () => {
  const editor = makeEditor();
  await editor._initWebRecent();
  assert.match(editor.activeDocumentId, /^web-/);
  assert.equal(editor.bridgeDocumentId, null);
});

test('刷新后按保存的 webDocumentId 找回同一篇，而不是新建一条', async () => {
  const backend = createMemoryBackend();
  const first = makeEditor({ _webRecentBackend: backend });
  await first._initWebRecent();
  const id = first.activeDocumentId;
  const reloaded = makeEditor({ _webRecentBackend: backend, _webRecentSavedState: () => ({ webDocumentId: id, fileName: 'a.md' }) });
  await reloaded._initWebRecent();
  assert.equal(reloaded.activeDocumentId, id);
  assert.equal(reloaded._webRecentList.length, 1);
});
