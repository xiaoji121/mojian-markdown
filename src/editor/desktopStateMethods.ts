// @ts-nocheck
import { createDesktopFileHandle } from './desktopFileHandle.ts';

// Desktop-only lifecycle. Web storage and browser file permissions remain unchanged.
export class DesktopStateMethods {
  async _prepareDesktopClose() {
    clearTimeout(this._saveT);
    this._saveT = null;
    try {
      // Capture even edits that have not reached the 600ms autosave timer.
      if (!this._persist()) {
        this._setStatus('桌面草稿保存失败 · 请重试保存或另存为');
        return false;
      }
      await this._localRestorePromise;
      await this._maybeWriteThroughLocalFile();
      await this._flushBridgeSync();
      const saved = this._persist(false);
      return saved && !(this.localFilePath && this.dirty);
    } catch {
      this._setStatus('退出前保存失败 · 请重试保存或另存为');
      return false;
    }
  }

  async _restoreDesktopFileLink() {
    const src = this.sourceRef.current;
    const path = this.localFilePath;
    if (!src || !path) return;
    const content = src.value;
    const baseline = this._localFileModifiedAt;
    const handle = createDesktopFileHandle(path, this.fileName);
    // A slow restore must never replace a new document or newer typing.
    const current = () => this.localFilePath === path && !this.fileHandle;
    try {
      const file = await handle.getFile();
      const text = this._cleanOpenedMarkdown(await file.text());
      if (!current()) return;
      if (src.value !== content) this._setDirty(true);
      this.fileHandle = handle;
      this._syncFileNameTooltip();
      if (text === src.value) {
        this._localFileModifiedAt = file.lastModified;
        this._setDirty(false);
      } else if (this.dirty) {
        if (!baseline || file.lastModified !== baseline) {
          this._localFileConflict = true;
          this._setStatus('已恢复草稿 · 本地文件也已更改，请检查后保存或另存为');
        } else {
          await this._maybeWriteThroughLocalFile();
        }
      } else {
        this._reloadFromLocalFile(text, file);
      }
      if (this.fileHandle === handle) this._startLocalFileWatcher();
    } catch {
      if (current()) this._setStatus('已恢复草稿 · 原文件不可用，请检查路径或另存为');
    }
  }
}
