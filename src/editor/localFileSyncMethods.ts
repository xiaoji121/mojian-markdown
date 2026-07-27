// @ts-nocheck
// 本地文件双向同步：
//   编辑器 → 本地：autosave 时把内容写穿回打开的本地文件（需要 readwrite 权限）。
//   本地 → 编辑器：轮询文件 lastModified，外部改动后自动重载；
//     若编辑器还有未写回的改动则进入冲突状态，暂停写回，等用户 ⌘S 显式覆盖。
// 句柄经 IndexedDB 持久化（见 fileHandleStore），刷新页面或从最近列表重开时自动恢复关联。
import { bridgeUrl } from './bridgeClient.ts';
import {
  listFileHandles,
  loadFileHandle,
  loadFolderHandles,
  saveFileHandle,
  saveFolderHandle
} from './fileHandleStore.ts';

const WATCH_INTERVAL_MS = 2000;

export class LocalFileSyncMethods {
  async _attachLocalFile(handle, { requestWrite = false } = {}) {
    this.fileHandle = handle;
    this._localFileConflict = false;
    if (requestWrite && handle.requestPermission) {
      try { await handle.requestPermission({ mode: 'readwrite' }); } catch {}
    }
    await this._updateLocalFileBaseline();
    this.localFilePath = await this._resolveLocalFilePath(handle);
    this._syncFileNameTooltip();
    if (this.fileName && this.fileName !== '未命名.md') saveFileHandle(this.fileName, handle);
    this._startLocalFileWatcher();
  }


  async _updateLocalFileBaseline(file = null) {
    try {
      const current = file || await this.fileHandle.getFile();
      this._localFileModifiedAt = current.lastModified;
    } catch {}
  }


  _startLocalFileWatcher() {
    this._stopLocalFileWatcher();
    if (!this.fileHandle || !this.fileHandle.getFile) return;
    this._fileWatchT = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this._checkLocalFileChange();
    }, WATCH_INTERVAL_MS);
    this._fileWatchFocus = () => this._checkLocalFileChange();
    window.addEventListener('focus', this._fileWatchFocus);
  }


  _stopLocalFileWatcher() {
    if (this._fileWatchT) { clearInterval(this._fileWatchT); this._fileWatchT = null; }
    if (this._fileWatchFocus) {
      window.removeEventListener('focus', this._fileWatchFocus);
      this._fileWatchFocus = null;
    }
  }


  _detachLocalFile() {
    this._stopLocalFileWatcher();
    this.fileHandle = null;
    this.localFilePath = null;
    this._localFileConflict = false;
    this._localFileModifiedAt = 0;
    this._syncFileNameTooltip();
  }

  // ===== 本地路径展示（基于已关联的文件夹） =====

  async _loadFolderHandles() {
    if (!this._folderHandles) this._folderHandles = await loadFolderHandles();
    return this._folderHandles || [];
  }


  // 浏览器拿不到文件的绝对路径；文件位于某个已关联文件夹内时，
  // 用 FileSystemDirectoryHandle.resolve 推导出「文件夹名/相对路径」。
  // 桌面端句柄自带真实绝对路径，直接使用。
  async _resolveLocalFilePath(handle) {
    if (!handle) return null;
    if (handle.desktopPath) return handle.desktopPath;
    for (const folder of await this._loadFolderHandles()) {
      try {
        if (!folder.handle || !folder.handle.resolve) continue;
        const segments = await folder.handle.resolve(handle);
        if (segments && segments.length) return folder.name + '/' + segments.join('/');
      } catch {}
    }
    return null;
  }


  _syncFileNameTooltip() {
    const el = this.fileNameRef?.current;
    if (el) el.title = this.localFilePath || this.fileName || '';
  }


  async associateLocalFolder() {
    if (!window.showDirectoryPicker) {
      this._setStatus('当前浏览器不支持关联文件夹');
      return;
    }
    try {
      const folder = await window.showDirectoryPicker();
      await saveFolderHandle(folder.name, folder);
      const known = await this._loadFolderHandles();
      this._folderHandles = [...known.filter((item) => item.name !== folder.name), { name: folder.name, handle: folder }];
      this._setStatus('已关联文件夹 · ' + folder.name);
      await this._refreshLocalFilePaths();
    } catch {}
  }


  // 关联新文件夹后：更新当前文档的路径，并为之前打开过的文档补写路径。
  async _refreshLocalFilePaths() {
    if (this.fileHandle) {
      this.localFilePath = await this._resolveLocalFilePath(this.fileHandle);
      this._syncFileNameTooltip();
      if (this.localFilePath) this._persist();
    }
    if (!this.agentBridgeEnabled) return;
    try {
      await this._refreshRecentDocuments();
      const known = new Set(this.recentDocuments.map((doc) => doc.fileName));
      for (const entry of await listFileHandles()) {
        if (!known.has(entry.name)) continue;
        if (this.fileHandle && entry.name === this.fileName) continue;
        const localPath = await this._resolveLocalFilePath(entry.handle);
        if (!localPath) continue;
        await fetch(bridgeUrl('/api/documents'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document: { fileName: entry.name, localPath } })
        });
      }
      await this._refreshRecentDocuments();
    } catch {}
  }


  async _checkLocalFileChange() {
    const handle = this.fileHandle;
    if (!handle || !handle.getFile || this._localWriteBusy) return;
    try {
      if (handle.queryPermission && await handle.queryPermission({ mode: 'read' }) !== 'granted') return;
      const file = await handle.getFile();
      if (!(file.lastModified > (this._localFileModifiedAt || 0))) return;
      const text = this._cleanOpenedMarkdown(await file.text());
      const src = this.sourceRef.current;
      if (!src) return;
      if (text === src.value) {
        this._localFileModifiedAt = file.lastModified;
        this._localFileConflict = false;
        return;
      }
      if (this.dirty) {
        this._localFileConflict = true;
        this._setStatus('本地文件已被其他程序修改 · ⌘S 保存将覆盖对方改动');
        return;
      }
      this._reloadFromLocalFile(text, file);
    } catch {
      // 句柄失效（文件被移动/删除、权限被收回）时静默停表，编辑器内容不受影响。
      this._stopLocalFileWatcher();
    }
  }


  _reloadFromLocalFile(text, file) {
    const src = this.sourceRef.current;
    if (!src) return;
    const scrollTop = src.scrollTop, scrollLeft = src.scrollLeft;
    src.value = text;
    src.scrollTop = scrollTop;
    src.scrollLeft = scrollLeft;
    this._localFileModifiedAt = file.lastModified;
    this._localFileConflict = false;
    this._resetEditingHistory();
    this._renderComments();
    this._renderPreview();
    this._updateCount();
    this._setDirty(false);
    this._persist();
    this._setStatus('本地文件已更新 · 已重新加载 ' + (this.fileName || ''));
  }


  async _maybeWriteThroughLocalFile() {
    const handle = this.fileHandle;
    if (!handle || !handle.createWritable || !this.dirty) return;
    if (this._localFileConflict || this._localWriteBusy) return;
    const src = this.sourceRef.current;
    if (!src) return;
    try {
      if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') return;
      const file = await handle.getFile();
      if (file.lastModified > (this._localFileModifiedAt || 0)) {
        // 外部改动还没合并进来，不能覆盖；交给变更检查决定重载还是标冲突。
        await this._checkLocalFileChange();
        return;
      }
      this._localWriteBusy = true;
      const content = src.value;
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      await this._updateLocalFileBaseline();
      // 写盘期间用户可能又输入了新内容，只有内容仍一致时才算“已保存”。
      if (src.value === content) this._setDirty(false);
      const t = new Date();
      this._setStatus('已同步到本地文件 · '
        + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'));
    } catch {
      // 写回失败不打断编辑；保留脏标记，用户仍可 ⌘S 手动保存。
    } finally {
      this._localWriteBusy = false;
    }
  }

  // ===== 恢复持久化的句柄 =====

  async _restoreLocalFileLink() {
    if (this.fileHandle || !this.fileName || this.fileName === '未命名.md') return;
    const handle = await loadFileHandle(this.fileName);
    if (!handle || !handle.getFile) return;
    let permission = 'granted';
    try {
      if (handle.queryPermission) permission = await handle.queryPermission({ mode: 'readwrite' });
    } catch {
      return;
    }
    if (permission === 'granted') {
      await this._adoptRestoredHandle(handle);
      return;
    }
    if (permission !== 'prompt') return;
    // 浏览器重启后恢复读写授权需要一次用户手势：挂到下一次点击/按键上。
    this._setStatus('本地文件同步待恢复 · 点击页面任意位置恢复');
    const resume = async () => {
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      try {
        if (await handle.requestPermission({ mode: 'readwrite' }) === 'granted') {
          await this._adoptRestoredHandle(handle);
        } else {
          this._setStatus('未授权访问本地文件 · 改动只保存在浏览器内');
        }
      } catch {}
    };
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
  }


  // 刷新页面后重新接上句柄：本地文件更新则重载，浏览器草稿更新则写回本地。
  async _adoptRestoredHandle(handle) {
    this.fileHandle = handle;
    this._localFileConflict = false;
    this.localFilePath = await this._resolveLocalFilePath(handle);
    this._syncFileNameTooltip();
    try {
      const file = await handle.getFile();
      const text = this._cleanOpenedMarkdown(await file.text());
      const src = this.sourceRef.current;
      this._localFileModifiedAt = file.lastModified;
      if (src && text !== src.value) {
        if (file.lastModified > (this._draftSavedAt || 0)) {
          this._reloadFromLocalFile(text, file);
        } else {
          this._setDirty(true);
          this._setStatus('浏览器草稿比本地文件新 · 正在同步到本地');
          await this._maybeWriteThroughLocalFile();
        }
      }
    } catch {}
    this._startLocalFileWatcher();
  }


  // 从最近文档列表打开时重新接上本地文件；本地文件是内容的最终来源。
  async _reattachLocalFileForDocument(doc) {
    this._detachLocalFile();
    if (!doc || !doc.fileName || doc.fileName === '未命名.md') return;
    const handle = await loadFileHandle(doc.fileName);
    if (!handle || !handle.getFile) return;
    try {
      let permission = handle.queryPermission
        ? await handle.queryPermission({ mode: 'readwrite' })
        : 'granted';
      if (permission === 'prompt' && handle.requestPermission) {
        permission = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (permission !== 'granted') return;
      const file = await handle.getFile();
      const text = this._cleanOpenedMarkdown(await file.text());
      this.fileHandle = handle;
      this._localFileModifiedAt = file.lastModified;
      this.localFilePath = await this._resolveLocalFilePath(handle);
      this._syncFileNameTooltip();
      const src = this.sourceRef.current;
      if (src && text !== src.value) {
        src.value = text;
        this._resetEditingHistory();
        this._renderComments();
        this._renderPreview();
        this._updateCount();
        this._persist();
        this._setStatus('已关联本地文件并加载最新内容 · ' + doc.fileName);
      }
      this._startLocalFileWatcher();
    } catch {}
  }

}
