// @ts-nocheck
// 浏览器版（无 Agent Bridge）的最近阅读：多篇文档存进 IndexedDB，
// 让 mojian.uk 也能在几篇文档之间来回切换，批注随文档一起保存。
// 桌面版与已连上本地服务时不启用，列表仍以 Reading Workspace 为准。
import { t } from './i18n.ts';
import { isPristineSample } from './sample.ts';
import { loadEditorState } from './storage.ts';

export const WEB_RECENT_LIMIT = 30;
const DB_NAME = 'mojian-web-recent';
const STORE = 'documents';
const WRITE_DELAY_MS = 400;

export function shouldRecordWebDocument(content, fileName) {
  const text = String(content || '');
  if (!text.trim()) return false;
  return !isPristineSample(text, fileName || '');
}

// 未固定的文档按 updatedAt 只留最近 limit 篇；固定的永不淘汰。
export function idsToPrune(records, pinnedSet, limit = WEB_RECENT_LIMIT) {
  const pinned = pinnedSet instanceof Set ? pinnedSet : new Set();
  return records
    .filter((record) => !pinned.has(record.documentId))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(limit)
    .map((record) => record.documentId);
}

export function toRecentSummary(record) {
  return {
    documentId: record.documentId,
    fileName: record.fileName,
    title: record.fileName,
    updatedAt: record.updatedAt,
    annotationCount: Array.isArray(record.comments) ? record.comments.length : 0,
    questionCount: 0
  };
}

export function createMemoryBackend() {
  const map = new Map();
  const copy = (value) => JSON.parse(JSON.stringify(value));
  return {
    getAll: async () => [...map.values()].map(copy),
    get: async (id) => (map.has(id) ? copy(map.get(id)) : undefined),
    put: async (record) => { map.set(record.documentId, copy(record)); },
    delete: async (id) => { map.delete(id); }
  };
}

export function createIndexedDbBackend() {
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'documentId' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  };
  const run = async (mode, action) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    getAll: () => run('readonly', (store) => store.getAll()),
    get: (id) => run('readonly', (store) => store.get(id)),
    put: (record) => run('readwrite', (store) => store.put(record)),
    delete: (id) => run('readwrite', (store) => store.delete(id))
  };
}

function newWebDocumentId() {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
  return 'web-' + random;
}

export class WebRecentMethods {
  _webRecentEnabled() {
    if (this.agentBridgeEnabled) return false;
    if (typeof window !== 'undefined' && window.mojianDesktop) return false;
    // 网页版手动「重新连接」到本地服务成功后，列表改由工作区提供。
    return this._recentDocumentsOffline !== false && !this._webRecentBroken;
  }

  _webRecentStore() {
    if (!this._webRecentBackend) this._webRecentBackend = createIndexedDbBackend();
    return this._webRecentBackend;
  }

  // 已加载时返回摘要数组；未启用、未加载或存储不可用时返回 null，渲染退回单篇模式。
  // 当前稿还没登记（示例文档、空白新建、刚从列表删除）时也列出一行，
  // 与旧版「只显示当前稿」保持一致，且这一行没有删除/固定操作。
  _webRecentDocs() {
    if (!this._webRecentEnabled() || !Array.isArray(this._webRecentList)) return null;
    if (this.activeDocumentId) return this._webRecentList;
    const draft = {
      documentId: '', fileName: this.fileName || t('未命名.md'), title: this.fileName,
      updatedAt: new Date().toISOString(), isCurrentDraft: true,
      annotationCount: Array.isArray(this.comments) ? this.comments.length : 0, questionCount: 0
    };
    return [draft, ...this._webRecentList];
  }

  async _initWebRecent() {
    if (!this._webRecentEnabled()) return;
    this._loadPinnedIds?.();
    // 刷新后找回当前文档的浏览器 id（与 Bridge 的 bridgeDocumentId 分开存，互不影响）。
    const saved = this._webRecentSavedState ? this._webRecentSavedState() : loadEditorState();
    if (!this.activeDocumentId && saved?.webDocumentId && saved.fileName === this.fileName) {
      this.activeDocumentId = saved.webDocumentId;
    }
    await this._webRecentReload();
    // 旧版只存单篇草稿：首次加载时把它登记成列表里的第一篇。
    this._webRecentTouch();
    await this._webRecentFlush();
  }

  async _webRecentReload() {
    try {
      const records = await this._webRecentStore().getAll();
      this._webRecentList = records.map(toRecentSummary);
    } catch {
      this._webRecentBroken = true;
      this._webRecentList = null;
    }
    this._renderRecentDocuments?.();
  }

  // 由 _persist 同步调用：给当前文档分配 id 并拍快照，写库走防抖。
  _webRecentTouch() {
    if (!this._webRecentEnabled()) return;
    const content = this.sourceRef?.current?.value ?? '';
    if (!shouldRecordWebDocument(content, this.fileName)) return;
    if (!this.activeDocumentId && this._webRecentDetachedContent === content) return;
    this._webRecentDetachedContent = undefined;
    if (!this.activeDocumentId) this.activeDocumentId = newWebDocumentId();
    const pending = this._webRecentPending;
    if (pending && pending.documentId !== this.activeDocumentId) void this._webRecentFlush();
    this._webRecentPending = {
      documentId: this.activeDocumentId,
      fileName: this.fileName || '未命名.md',
      content,
      comments: Array.isArray(this.comments) ? this.comments : [],
      updatedAt: new Date().toISOString()
    };
    clearTimeout(this._webRecentT);
    const delay = this._webRecentDelay ?? WRITE_DELAY_MS;
    this._webRecentT = setTimeout(() => { void this._webRecentFlush(); }, delay);
  }

  async _webRecentFlush() {
    clearTimeout(this._webRecentT);
    this._webRecentT = null;
    const record = this._webRecentPending;
    this._webRecentPending = null;
    const previous = this._webRecentWriting || Promise.resolve();
    const writing = previous.catch(() => {}).then(async () => {
      if (!record) return;
      const store = this._webRecentStore();
      try {
        await store.put(JSON.parse(JSON.stringify(record)));
        const prune = idsToPrune(await store.getAll(), this._pinnedSet?.());
        for (const id of prune) await store.delete(id);
      } catch {
        this._webRecentBroken = true;
      }
      await this._webRecentReload();
    });
    this._webRecentWriting = writing;
    await writing;
  }

  async _openWebRecentDocument(documentId) {
    const src = this.sourceRef?.current;
    if (!documentId) { this.setViewMode?.('preview'); return; }
    if (!src) return;
    if (documentId === this.activeDocumentId && !this.previewOverrideMarkdown) return;
    if (this.fileHandle && this.dirty && !this._webRecentConfirm(t('当前修改尚未写回文件，确定切换到另一篇？'))) return;
    this._persist?.(false);
    await this._webRecentFlush();
    let record;
    try { record = await this._webRecentStore().get(documentId); } catch { record = null; }
    if (!record) {
      this._setStatus?.(t('这篇已不在浏览器的最近阅读里'));
      await this._webRecentReload();
      return;
    }
    this._detachLocalFile?.();
    this.previewOverrideMarkdown = '';
    this.activeAnswerRequestId = null;
    src.value = record.content || '';
    this._resetEditingHistory?.();
    this.bridgeDocumentId = null;
    this.activeDocumentId = record.documentId;
    this.comments = Array.isArray(record.comments) ? record.comments : [];
    this._setFileName(record.fileName || '未命名.md');
    this._renderComments?.();
    this._renderPreview?.();
    this._setDirty?.(false);
    this._persist?.();
    this._setStatus?.(t('已打开 · {name}', { name: this.fileName }));
  }

  async _deleteWebRecentDocument(doc) {
    if (!doc || !doc.documentId) return;
    const label = doc.fileName || t('该文档');
    if (!this._webRecentConfirm(t('从最近阅读中删除「{name}」？其批注将一并删除。', { name: label }))) return;
    if (this._webRecentPending?.documentId === doc.documentId) {
      clearTimeout(this._webRecentT);
      this._webRecentPending = null;
    }
    try {
      await this._webRecentWriting;
      await this._webRecentStore().delete(doc.documentId);
    } catch {
      this._setStatus?.(t('删除失败 · 浏览器存储不可用'));
      return;
    }
    if (this._pinnedSet?.().delete(doc.documentId)) this._savePinnedIds?.();
    if (this.activeDocumentId === doc.documentId) {
      // 编辑器里的内容保持不动；只有再改动才重新登记，避免刚删就被下一次保存写回。
      this.activeDocumentId = null;
      this._webRecentDetachedContent = this.sourceRef?.current?.value ?? '';
    }
    this._setStatus?.(t('已从最近阅读删除 · {name}', { name: label }));
    await this._webRecentReload();
  }

  _webRecentConfirm(message) {
    if (typeof this._confirm === 'function') return this._confirm(message);
    return typeof window === 'undefined' || !window.confirm || window.confirm(message);
  }

  _appendWebRecentNote(list) {
    if (!list || !this._webRecentDocs()) return;
    const note = document.createElement('p');
    note.className = 'workspace-local-note';
    note.textContent = t('最近阅读保存在此浏览器 · 最多 {count} 篇', { count: WEB_RECENT_LIMIT });
    list.appendChild(note);
  }
}
