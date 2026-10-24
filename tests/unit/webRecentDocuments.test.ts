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

test('当前这篇能存进最近阅读时，换文档无需确认替换', async () => {
  const editor = makeEditor();
  await editor._initWebRecent();
  assert.equal(editor._webRecentKeepsCurrent(), true);
  editor.sourceRef.current.value += '\n刚写的一句';
  assert.equal(await editor._webRecentSaveCurrent(), true);
  const saved = await editor._webRecentBackend.get(editor.activeDocumentId);
  assert.match(saved.content, /刚写的一句/);
});

test('示例文档或空白稿没有可丢失的内容，同样无需确认', async () => {
  const editor = makeEditor();
  editor.sourceRef.current.value = '';
  editor.fileName = '未命名.md';
  await editor._initWebRecent();
  assert.equal(editor._webRecentKeepsCurrent(), true);
  assert.equal(await editor._webRecentSaveCurrent(), true);
  assert.equal(editor._webRecentList.length, 0);
});

test('仍需确认：存储不可用、关联文件未写回、空正文带批注、刚从列表删除未改动', async () => {
  const broken = makeEditor({ _webRecentBackend: { getAll: async () => { throw new Error('x'); } } });
  await broken._initWebRecent();
  assert.equal(broken._webRecentKeepsCurrent(), false);
  assert.equal(await broken._webRecentSaveCurrent(), false);

  const linked = makeEditor({ fileHandle: {}, dirty: true });
  await linked._initWebRecent();
  assert.equal(linked._webRecentKeepsCurrent(), false);

  const orphanNotes = makeEditor({ comments: [{ id: 'c' }] });
  orphanNotes.sourceRef.current.value = '';
  await orphanNotes._initWebRecent();
  assert.equal(orphanNotes._webRecentKeepsCurrent(), false);

  const deleted = makeEditor({ _confirm: () => true });
  await deleted._initWebRecent();
  await deleted._deleteWebRecentDocument(deleted._webRecentList[0]);
  assert.equal(await deleted._webRecentSaveCurrent(), false);
});

test('桌面版或连上本地服务时不接管确认流程', async () => {
  const editor = makeEditor({ agentBridgeEnabled: true });
  assert.equal(editor._webRecentKeepsCurrent(), false);
  assert.equal(await editor._webRecentSaveCurrent(), false);
});

async function seedRecords(editor: any, records: any[]) {
  for (const r of records) await editor._webRecentBackend.put(r);
  await editor._webRecentReload();
}
const rec = (id: string, fileName: string, content: string, updatedAt: string, comments: any[] = []) =>
  ({ documentId: id, fileName, content, comments, updatedAt });

test('导入的文件名在最近阅读里没有：新建记录', async () => {
  const editor = makeEditor();
  await editor._initWebRecent();
  assert.equal(await editor._webRecentResolveImport('新文件.md', '# 新'), null);
});

test('同名且内容一样：沿用原记录与批注', async () => {
  const editor = makeEditor();
  await seedRecords(editor, [rec('web-old', 'Style guide.md', '# 风格', '2026-10-20T00:00:00Z', [{ id: 'c1' }])]);
  const adopted = await editor._webRecentResolveImport('Style guide.md', '# 风格');
  assert.equal(adopted.documentId, 'web-old');
  assert.equal(adopted.content, '# 风格');
  assert.equal(adopted.comments.length, 1);
});

const recI = (id: string, fileName: string, content: string, importedContent: string | undefined, comments: any[] = []) =>
  ({ documentId: id, fileName, content, importedContent, comments, updatedAt: '2026-10-24T00:00:00Z' });

test('浏览器里没改过、文件改了：沿用记录，换成文件内容，批注保留，不询问', async () => {
  const editor = makeEditor({ _confirm: () => { throw new Error('不应询问'); } });
  await seedRecords(editor, [recI('web-old', 'a.md', '# 旧', '# 旧', [{ id: 'c1' }])]);
  const adopted = await editor._webRecentResolveImport('a.md', '# 新');
  assert.deepEqual([adopted.documentId, adopted.content, adopted.comments.length, adopted.importedContent], ['web-old', '# 新', 1, '# 新']);
});

test('浏览器里改过、文件没变：保留浏览器修改，不询问', async () => {
  const editor = makeEditor({ _confirm: () => { throw new Error('不应询问'); } });
  await seedRecords(editor, [recI('web-old', 'a.md', '# 原文 + 我在浏览器的修改', '# 原文')]);
  const adopted = await editor._webRecentResolveImport('a.md', '# 原文');
  assert.equal(adopted.documentId, 'web-old');
  assert.equal(adopted.content, '# 原文 + 我在浏览器的修改');
  assert.equal(adopted.importedContent, '# 原文');
});

test('两边都改了（或旧记录无从判断）：询问用哪一版', async () => {
  for (const imported of ['# 原文', undefined]) {
    for (const [answer, expected] of [[true, '# 文件新版'], [false, '# 浏览器改过']] as const) {
      const asked: string[] = [];
      const editor = makeEditor({ _confirm: (m: string) => { asked.push(m); return answer; } });
      await seedRecords(editor, [recI('web-old', 'a.md', '# 浏览器改过', imported)]);
      const adopted = await editor._webRecentResolveImport('a.md', '# 文件新版');
      assert.equal(asked.length, 1);
      assert.equal(adopted.content, expected);
    }
  }
});

test('导入内容随记录保存；新建空白稿不沿用上一篇的导入内容；从列表打开时恢复', async () => {
  const editor = makeEditor();
  await editor._initWebRecent();
  editor._webRecentApplyImport(null, '# 文件');
  editor.fileName = 'f.md';
  editor._persist();
  await editor._webRecentFlush();
  const imported = editor.activeDocumentId;
  assert.equal((await editor._webRecentBackend.get(imported)).importedContent, '# 文件');

  editor.activeDocumentId = null;
  editor.fileName = '空白.md';
  editor.sourceRef.current.value = '# 新写的';
  editor._persist();
  await editor._webRecentFlush();
  assert.equal((await editor._webRecentBackend.get(editor.activeDocumentId)).importedContent, undefined);

  await editor._openWebRecentDocument(imported);
  assert.equal(editor._webRecentImported, '# 文件');
});

test('多条同名时优先内容完全一致的那条，否则取最近的', async () => {
  const editor = makeEditor();
  await seedRecords(editor, [
    rec('web-1', 'a.md', '# 甲', '2026-10-21T00:00:00Z'),
    rec('web-2', 'a.md', '# 乙', '2026-10-23T00:00:00Z')
  ]);
  assert.equal((await editor._webRecentResolveImport('a.md', '# 甲')).documentId, 'web-1');
  editor._confirm = () => true;
  assert.equal((await editor._webRecentResolveImport('a.md', '# 丙')).documentId, 'web-2');
});

test('清理旧重复：同名同内容且无批注的旧记录被删，有批注或已固定的保留', async () => {
  const editor = makeEditor();
  editor.pinnedDocumentIds = new Set(['web-pinned']);
  editor.sourceRef.current.value = '';
  editor.fileName = '未命名.md';
  await seedRecords(editor, [
    rec('web-a', 'S.md', '# s', '2026-10-21T00:00:00Z'),
    rec('web-b', 'S.md', '# s', '2026-10-22T00:00:00Z'),
    rec('web-c', 'S.md', '# s', '2026-10-23T00:00:00Z'),
    rec('web-noted', 'S.md', '# s', '2026-10-20T00:00:00Z', [{ id: 'c' }]),
    rec('web-pinned', 'S.md', '# s', '2026-10-19T00:00:00Z'),
    rec('web-other', 'S.md', '# 不同', '2026-10-18T00:00:00Z')
  ]);
  await editor._initWebRecent();
  const ids = editor._webRecentList.map((d: any) => d.documentId).sort();
  assert.deepEqual(ids, ['web-c', 'web-noted', 'web-other', 'web-pinned']);
});
