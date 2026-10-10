// @ts-nocheck
import { t } from './i18n.ts';
import { isPristineSample } from './sample.ts';
import { shouldConfirmLeave } from './annotationExport.ts';
import { createDesktopFileHandle } from './desktopFileHandle.ts';
import { SITE_URL } from '../landing/site.ts';

export class EditingFileLayoutMethods {
  _captureEditingState() {
    const src = this.sourceRef.current;
    if (!src) return null;
    return {
      value: src.value,
      selectionStart: src.selectionStart,
      selectionEnd: src.selectionEnd,
      scrollTop: src.scrollTop,
      scrollLeft: src.scrollLeft
    };
  }


  _resetEditingHistory() {
    const initial = this._captureEditingState();
    this._editingHistory = initial ? [initial] : [];
    this._editingHistoryIndex = initial ? 0 : -1;
    this._lastHistoryInputType = '';
    this._lastHistoryInputAt = 0;
    this._syncEditingHistoryButtons();
  }


  _syncCurrentEditingState() {
    const current = this._editingHistory?.[this._editingHistoryIndex];
    const actual = this._captureEditingState();
    if (!current || !actual || current.value !== actual.value) return;
    if (current.selectionStart !== actual.selectionStart || current.selectionEnd !== actual.selectionEnd) {
      this._lastHistoryInputType = '';
    }
    this._editingHistory[this._editingHistoryIndex] = actual;
  }


  _recordEditingHistory(inputType = '', forceNewEntry = false) {
    const next = this._captureEditingState();
    if (!next) return;
    if (!Array.isArray(this._editingHistory) || this._editingHistoryIndex < 0) {
      this._resetEditingHistory();
      return;
    }
    const current = this._editingHistory[this._editingHistoryIndex];
    if (current && current.value === next.value) return;
    const now = Date.now();
    const coalesce = !forceNewEntry
      && inputType
      && inputType === this._lastHistoryInputType
      && now - this._lastHistoryInputAt < 800
      && this._editingHistoryIndex === this._editingHistory.length - 1
      && this._editingHistoryIndex > 0;
    this._editingHistory.splice(this._editingHistoryIndex + 1);
    if (coalesce) {
      this._editingHistory[this._editingHistoryIndex] = next;
    } else {
      this._editingHistory.push(next);
      this._editingHistoryIndex += 1;
    }
    if (this._editingHistory.length > 200) {
      this._editingHistory.shift();
      this._editingHistoryIndex -= 1;
    }
    this._lastHistoryInputType = inputType;
    this._lastHistoryInputAt = now;
    this._syncEditingHistoryButtons();
  }


  _syncEditingHistoryButtons() {
    const canUndo = this._editingHistoryIndex > 0;
    const canRedo = Array.isArray(this._editingHistory)
      && this._editingHistoryIndex >= 0
      && this._editingHistoryIndex < this._editingHistory.length - 1;
    if (this.undoButtonRef?.current) this.undoButtonRef.current.disabled = !canUndo;
    if (this.redoButtonRef?.current) this.redoButtonRef.current.disabled = !canRedo;
  }


  _applyEditingHistory(index) {
    const state = this._editingHistory?.[index];
    const src = this.sourceRef.current;
    if (!state || !src) return;
    this._editingHistoryIndex = index;
    src.value = state.value;
    this._restoreSourceView(
      src,
      state.selectionStart,
      state.selectionEnd,
      state.scrollTop,
      state.scrollLeft
    );
    this._lastHistoryInputType = '';
    this._renderPreview();
    this._touch();
    this._syncEditingHistoryButtons();
  }


  undoEdit() {
    if (this._editingHistoryIndex > 0) {
      this._applyEditingHistory(this._editingHistoryIndex - 1);
    }
  }


  redoEdit() {
    if (this._editingHistoryIndex < (this._editingHistory?.length || 0) - 1) {
      this._applyEditingHistory(this._editingHistoryIndex + 1);
    }
  }


  _restoreSourceView(src, selectionStart, selectionEnd, scrollTop, scrollLeft) {
    src.selectionStart = selectionStart;
    src.selectionEnd = selectionEnd;
    src.focus({ preventScroll: true });
    src.scrollTop = scrollTop;
    src.scrollLeft = scrollLeft;
  }


  _wrapSel(before, after, placeholder) {
    const src = this.sourceRef.current;
    if (!src) return;
    this._syncCurrentEditingState();
    const s = src.selectionStart, e = src.selectionEnd, val = src.value;
    const scrollTop = src.scrollTop, scrollLeft = src.scrollLeft;
    const sel = val.slice(s, e) || placeholder || '';
    src.value = val.slice(0, s) + before + sel + after + val.slice(e);
    this._restoreSourceView(
      src,
      s + before.length,
      s + before.length + sel.length,
      scrollTop,
      scrollLeft
    );
    this._recordEditingHistory('', true);
    this._renderPreview();
    this._touch();
  }


  _linePrefix(prefix) {
    const src = this.sourceRef.current;
    if (!src) return;
    this._syncCurrentEditingState();
    const val = src.value;
    let s = src.selectionStart, e = src.selectionEnd;
    let ls = val.lastIndexOf('\n', s - 1) + 1;
    const scrollTop = src.scrollTop, scrollLeft = src.scrollLeft;
    const block = val.slice(ls, e);
    const replaced = block.split('\n').map((l) => prefix + l).join('\n');
    src.value = val.slice(0, ls) + replaced + val.slice(e);
    this._restoreSourceView(src, ls, ls + replaced.length, scrollTop, scrollLeft);
    this._recordEditingHistory('', true);
    this._renderPreview();
    this._touch();
  }


  _sourceKeydown(e) {
    const modifier = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (modifier && !e.altKey && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redoEdit();
      else this.undoEdit();
      return;
    }
    if (modifier && !e.altKey && key === 'y') {
      e.preventDefault();
      this.redoEdit();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const src = this.sourceRef.current;
      this._syncCurrentEditingState();
      const s = src.selectionStart, en = src.selectionEnd;
      src.value = src.value.slice(0, s) + '  ' + src.value.slice(en);
      src.selectionStart = src.selectionEnd = s + 2;
      this._recordEditingHistory('', true);
      this._renderPreview();
      this._touch();
    }
  }

  // ===== file ops =====

  _cleanOpenedMarkdown(text) {
    let value = String(text || '');
    // 钉钉文档等导出源把空格全写成 U+00A0（不换行空格），整段无法断行；归一化为普通空格。
    value = value.replace(/\u00A0/g, ' ');
    value = value.replace(/<sup\b(?=[^>]*\bdata-comment-badge=)[\s\S]*?<\/sup>/gi, '');
    let previous = '';
    while (previous !== value) {
      previous = value;
      value = value.replace(/<span\b(?=[^>]*\bdata-comment-id=)[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    }
    return value;
  }


  _initFileNameEditing() {
    const element = this.fileNameRef.current;
    if (!element || this._fileNameEditingReady) return;
    this._fileNameEditingReady = true;
    this._syncFileNameTooltip();
    element.addEventListener('dblclick', (event) => {
      event.preventDefault();
      this._beginFileNameEditing();
    });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this._finishFileNameEditing(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this._finishFileNameEditing(false);
      }
    });
    element.addEventListener('blur', () => this._finishFileNameEditing(true));
  }


  _beginFileNameEditing() {
    const element = this.fileNameRef.current;
    if (!element || this._fileNameEditing) return;
    this._fileNameEditing = true;
    this._fileNameBeforeEditing = this.fileName || '未命名.md';
    element.setAttribute('contenteditable', 'true');
    element.setAttribute('role', 'textbox');
    element.classList.add('is-editing');
    element.focus();
    const selection = window.getSelection?.();
    if (!selection || !document.createRange) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }


  _normalizedFileName(name) {
    const trimmed = String(name || '').replace(/[\r\n]+/g, ' ').trim();
    if (!trimmed) return '';
    return /\.(?:md|markdown|txt)$/i.test(trimmed) ? trimmed : trimmed + '.md';
  }


  async _finishFileNameEditing(commit) {
    const element = this.fileNameRef.current;
    if (!element || !this._fileNameEditing) return;
    const previous = this._fileNameBeforeEditing || this.fileName || '未命名.md';
    const next = commit ? this._normalizedFileName(element.textContent) : previous;
    this._fileNameEditing = false;
    element.removeAttribute('contenteditable');
    element.removeAttribute('role');
    element.classList.remove('is-editing');
    if (!next) {
      element.textContent = previous;
      this._setStatus(t("文档名不能为空"));
      return;
    }
    if (next === previous) {
      element.textContent = previous;
      return;
    }
    if (this.fileHandle) {
      const renamed = await this._renameLocalFile(next);
      if (!renamed) {
        element.textContent = previous;
        return;
      }
    }
    this._setFileName(next);
    this._persist();
    this._setStatus(t("已重命名为 {name}", { name: next }));
  }


  async _renameLocalFile(nextName) {
    const handle = this.fileHandle;
    const desktop = window.mojianDesktop;
    if (this._saveT) {
      clearTimeout(this._saveT);
      this._saveT = null;
    }
    this._stopLocalFileWatcher();
    try {
      if (handle.desktopPath && desktop?.renameMarkdownFile) {
        const renamed = await desktop.renameMarkdownFile(handle.desktopPath, nextName);
        this._setFileName(renamed.name);
        await this._attachLocalFile(createDesktopFileHandle(renamed.path, renamed.name));
        await this._maybeWriteThroughLocalFile();
        if (this.dirty) this._saveT = setTimeout(() => this._autosave(), 600);
        return true;
      }
      if (typeof handle.move === 'function') {
        await handle.move(nextName);
        this._setFileName(nextName);
        await this._attachLocalFile(handle);
        await this._maybeWriteThroughLocalFile();
        if (this.dirty) this._saveT = setTimeout(() => this._autosave(), 600);
        return true;
      }
      this._startLocalFileWatcher();
      if (this.dirty) this._saveT = setTimeout(() => this._autosave(), 600);
      this._setStatus(t("当前浏览器不支持原地重命名本地文件"));
      return false;
    } catch (error) {
      this._startLocalFileWatcher();
      if (this.dirty) this._saveT = setTimeout(() => this._autosave(), 600);
      this._setStatus(t("重命名失败：{error}", { error: error.message || error }));
      return false;
    }
  }


  // ===== 桌面端（Electron）文件能力：原生对话框 + 真实路径，句柄接入既有同步逻辑 =====

  _initDesktop() {
    const desktop = window.mojianDesktop;
    if (!desktop) return;
    // 网页版专属 UI（关联文件夹入口、宽屏下的 ⋯ 菜单）由 CSS 按此标记隐藏。
    document.body.classList.add('is-desktop-app');
    const homeLink = document.querySelector?.('.settings-home-link');
    if (homeLink) {
      homeLink.href = SITE_URL;
      homeLink.target = '_blank';
      homeLink.rel = 'noopener noreferrer';
    }
    this._desktopCloseCleanup = desktop.onBeforeClose?.(() => this._prepareDesktopClose());
    desktop.onMenu((action) => {
      if (action === 'new') this.onNew();
      else if (action === 'open') this.onOpen();
      else if (action === 'open-path') this.onOpenAbsolutePath();
      else if (action === 'save') this.onSave();
      else if (action === 'save-as') this.onSaveAs();
    });
    // 双击关联的 .md 文件 / 菜单打开：主进程读好内容推送过来。
    desktop.onOpenPath((file) => { this._openDesktopFile(file); });
    desktop.consumePendingOpen()
      .then((file) => { if (file) this._openDesktopFile(file); else if (desktop.readClipboardText) this._checkClipboardMarkdownPath(); })
      .catch(() => {});
    if (desktop.readClipboardText && window.addEventListener) {
      this._desktopClipboardFocus = () => this._checkClipboardMarkdownPath();
      window.addEventListener('focus', this._desktopClipboardFocus);
    }
  }


  _clipboardMarkdownPath(text) {
    let value = String(text || '').trim();
    if (!value || /[\r\n]/.test(value)) return '';
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1).trim();
    const absolute = value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
    if (!absolute || !/\.(?:md|markdown)$/i.test(value)) return '';
    return value;
  }


  async _checkClipboardMarkdownPath() {
    const desktop = window.mojianDesktop;
    if (!desktop?.readClipboardText) return;
    try {
      const path = this._clipboardMarkdownPath(await desktop.readClipboardText());
      if (!path) {
        this._lastClipboardMarkdownPath = '';
        return;
      }
      if (path === this._lastClipboardMarkdownPath) return;
      this._lastClipboardMarkdownPath = path;
      this.onOpenAbsolutePath(path, { fromClipboard: true });
    } catch {}
  }


  async _openDesktopFile(picked) {
    const src = this.sourceRef.current;
    if (!picked || !picked.path || !src) return;
    const text = this._cleanOpenedMarkdown(picked.content);
    const generation = this._documentOpenGeneration = (this._documentOpenGeneration || 0) + 1;
    this.bridgeDocumentId = null;
    this.activeDocumentId = null;
    this._setFileName(picked.name);
    src.value = text;
    this._resetEditingHistory();
    const openRevision = this._documentEditRevision || 0;
    const superseded = () => generation !== this._documentOpenGeneration;
    const changedDuringOpen = () => src.value !== text
      || (this._documentEditRevision || 0) !== openRevision;
    this.comments = [];
    await this._attachLocalFile(createDesktopFileHandle(picked.path, picked.name));
    await this._adoptBridgeDocument(picked.name);
    if (superseded()) return;
    this._renderComments();
    this._renderPreview();
    this._setDirty(changedDuringOpen());
    this._autosave();
    this._setStatus(t("已打开 · {name}", { name: picked.name }));
  }


  async onOpen() {
    if (window.mojianDesktop) {
      const picked = await window.mojianDesktop.openMarkdownFile();
      if (picked) await this._openDesktopFile(picked);
      return;
    }
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }]
        });
        const file = await handle.getFile();
        const text = this._cleanOpenedMarkdown(await file.text());
        this.bridgeDocumentId = null;
        this.activeDocumentId = null;
        this._setFileName(file.name);
        this.sourceRef.current.value = text;
        this._resetEditingHistory();
        this.comments = [];
        // 接上双向同步（顺手请求写权限），并认领工作区里同名文档的批注与问答。
        await this._attachLocalFile(handle, { requestWrite: true });
        await this._adoptBridgeDocument(file.name);
        this._renderComments();
        this._renderPreview();
        this._setDirty(false);
        this._autosave();
        this._setStatus(t("已打开 · {name}", { name: file.name }));
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        this._setStatus(t('打开失败 · {error}', { error: (e && e.message) || e || t('未知错误') }));
      }
    } else {
      const inp = document.createElement('input');
      inp.type = 'file';
      // iOS and some Android file pickers do not register .md as
      // text/markdown and will grey those files out when accept is present.
      // Leave the picker unrestricted; FileReader safely reads the selection
      // as text below.
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
          this.sourceRef.current.value = this._cleanOpenedMarkdown(r.result);
          this._resetEditingHistory();
          this.bridgeDocumentId = null;
          this.activeDocumentId = null;
          this._setFileName(f.name);
          this._detachLocalFile();
          this.comments = [];
          await this._adoptBridgeDocument(f.name);
          this._renderComments();
          this._renderPreview();
          this._setDirty(false);
          this._autosave();
          this._setStatus(t("已打开 · {name}（浏览器不支持原地保存，将以下载方式保存）", { name: f.name }));
        };
        r.readAsText(f);
      };
      inp.click();
    }
  }


  onOpenAbsolutePath(initialPath = '', options = {}) {
    const desktop = window.mojianDesktop;
    if (!desktop || !desktop.openMarkdownPath) {
      this._setStatus(t("输入路径打开仅支持桌面版"));
      return;
    }
    const { modal, input, note } = this._ensureAbsolutePathDialog();
    input.value = initialPath || this.localFilePath || '';
    const fromClipboard = options.fromClipboard === true;
    const title = modal.querySelector('.file-path-title');
    const description = modal.querySelector('.file-path-description');
    if (title) title.textContent = fromClipboard ? t("打开剪贴板中的 Markdown？") : t("输入绝对路径打开");
    if (description) description.textContent = fromClipboard
      ? t("检测到剪贴板中有 Markdown 文件路径，是否用墨笺打开？")
      : t("粘贴 Markdown 文件的完整路径，打开后会继续同步保存到该文件。");
    note.textContent = fromClipboard ? t("路径已自动填入，确认后才会打开文件") : t("支持 .md、.markdown 和 .txt 文件");
    modal.style.display = 'flex';
    setTimeout(() => { input.focus(); input.select(); }, 0);
  }


  _ensureAbsolutePathDialog() {
    if (this._absolutePathDialog) return this._absolutePathDialog;
    const modal = document.createElement('div');
    modal.className = 'file-path-modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'file-path-title');
    modal.innerHTML = `<section class="file-path-modal">
      <strong id="file-path-title" class="file-path-title">${t("输入绝对路径打开")}</strong>
      <p class="file-path-description">${t("粘贴 Markdown 文件的完整路径，打开后会继续同步保存到该文件。")}</p>
      <input class="file-path-input" type="text" spellcheck="false" autocomplete="off" placeholder="/Users/name/Documents/note.md">
      <small class="file-path-note">${t("支持 .md、.markdown 和 .txt 文件")}</small>
      <div class="file-path-actions"><button type="button" class="file-path-cancel" data-i18n="取消">${t("取消")}</button>
      <button type="button" class="file-path-submit" data-i18n="打开" data-i18n-aria-label="打开该路径" aria-label="${t('打开该路径')}">${t("打开")}</button></div>
    </section>`;
    const input = modal.querySelector('.file-path-input');
    const note = modal.querySelector('.file-path-note');
    modal.querySelector('.file-path-cancel').addEventListener('click', () => this.closeAbsolutePathDialog());
    modal.querySelector('.file-path-submit').addEventListener('click', () => this.submitAbsolutePathOpen());
    input.addEventListener('keydown', (event) => this._absolutePathKeydown(event));
    document.body.appendChild(modal);
    this._absolutePathDialog = { modal, input, note };
    return this._absolutePathDialog;
  }


  closeAbsolutePathDialog() {
    if (this._absolutePathDialog) this._absolutePathDialog.modal.style.display = 'none';
  }


  _absolutePathKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.submitAbsolutePathOpen();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeAbsolutePathDialog();
    }
  }


  async submitAbsolutePathOpen() {
    const desktop = window.mojianDesktop;
    const dialog = this._absolutePathDialog;
    const input = dialog && dialog.input;
    const note = dialog && dialog.note;
    if (!desktop || !desktop.openMarkdownPath || !input) return false;
    const filePath = input.value.trim();
    if (!filePath) return;
    if (note) note.textContent = t("正在打开…");
    try {
      const picked = await desktop.openMarkdownPath(filePath);
      if (!picked) throw new Error(t("文件不存在或不可读"));
      await this._openDesktopFile(picked);
      this.closeAbsolutePathDialog();
      return true;
    } catch (error) {
      const message = error.message || String(error);
      if (note) note.textContent = t("打开失败 · {error}", { error: message });
      this._setStatus(t("打开失败 · {error}", { error: message }));
      return false;
    }
  }


  async onSave() {
    const src = this.sourceRef.current;
    if (!src) return;
    const handle = this.fileHandle;
    // 无写盘能力时禁止静默 Save：说明并导向备份包
    if ((!handle || !handle.createWritable) && !(typeof window !== 'undefined' && window.mojianDesktop)) {
      if (!(typeof window !== 'undefined' && window.showSaveFilePicker)) {
        this._setStatus?.(t('浏览器无法写盘，请用下载备份包'));
        await this.downloadFullBackup?.();
        return;
      }
      await this.onSaveAs();
      return;
    }
    if (!handle || !handle.createWritable) { await this.onSaveAs(); return; }
    const content = src.value;
    const save = async () => {
      try {
        const w = await handle.createWritable();
        await w.write(content); await w.close();
        if (this.fileHandle !== handle) return;
        await this._updateLocalFileBaseline();
        if (this.fileHandle !== handle) return;
        this._localFileConflict = false;
        this._setDirty(src.value !== content);
        this._autosave();
        this._setStatus(this.dirty ? t("已保存较早版本 · 最新修改仍待同步") : t("✓ 已保存到 {name}", { name: this.fileName }));
        const now = new Date();
        this._lastWriteBackLabel = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        this._syncPersistentStatus?.();
      } catch (e) { this._setStatus(t("保存失败：{error}", { error: e.message || e })); }
    };
    if (this._queueLocalFileWrite) await this._queueLocalFileWrite(save);
    else await save();
  }


  // 另存为：无视已关联的句柄，总是让用户挑一个新目标，保存后切换到新文件继续编辑。
  async onSaveAs() {
    const save = () => this._saveAsSnapshot();
    try {
      // Browser pickers need the original user gesture; native dialogs do not.
      if (window.mojianDesktop && this._queueLocalFileWrite) await this._queueLocalFileWrite(save);
      else await save();
    } catch (e) { this._setStatus(t("另存为失败：{error}", { error: e.message || e })); }
  }

  async _saveAsSnapshot() {
    const src = this.sourceRef.current;
    if (!src) return;
    const content = src.value;
    const originalHandle = this.fileHandle, originalName = this.fileName;
    const sameDocument = () => this.fileHandle === originalHandle && this.fileName === originalName;
    const suggested = this.fileName && this.fileName !== '未命名.md' ? this.fileName : 'document.md';
    if (window.mojianDesktop) {
      const saved = await window.mojianDesktop.saveMarkdownFileAs(suggested, content);
      if (!saved || !sameDocument()) return;
      this._setFileName(saved.name);
      const nextHandle = createDesktopFileHandle(saved.path, saved.name);
      await this._attachLocalFile(nextHandle);
      if (this.fileHandle !== nextHandle) return;
      this._setDirty(src.value !== content);
      this._autosave();
      this._setStatus(t("✓ 已保存到 {name}", { name: saved.name }));
      return;
    }
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }]
        });
        const w = await handle.createWritable();
        await w.write(content); await w.close();
        if (!sameDocument()) return;
        this._setFileName(handle.name);
        await this._attachLocalFile(handle);
        if (this.fileHandle !== handle) return;
        this._setDirty(src.value !== content); this._autosave();
        this._setStatus(t("✓ 已保存到 {name}", { name: handle.name }));
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        this._setStatus(t('另存为失败：{error}', { error: (e && e.message) || e || t('未知错误') }));
      }
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggested;
    a.click();
    URL.revokeObjectURL(a.href);
    this._setDirty(src.value !== content);
    this._setStatus(t("✓ 已下载 {name}", { name: a.download }));
  }


  // ===== 顶栏「文件」下拉菜单 =====

  onNew() {
    const hasFile = !!(this.fileHandle || this.localFilePath);
    const content = this.sourceRef.current?.value || '';
    if (shouldConfirmLeave({
      hasFile,
      dirty: !!this.dirty,
      content,
      commentCount: Array.isArray(this.comments) ? this.comments.length : 0,
      pristineSample: isPristineSample(content, this.fileName || '')
    })) {
      const message = t(hasFile
        ? '当前修改尚未写回文件，确定新建空白文档？'
        : '当前只有浏览器草稿，新建将清空此稿（可先下载备份）。确定新建？');
      if (!window.confirm(message)) return;
    }
    if (this.viewMode === 'preview') this.setViewMode('editor');
    this.sourceRef.current.value = '';
    this._resetEditingHistory();
    this._detachLocalFile();
    this.activeDocumentId = null;
    this.bridgeDocumentId = null;
    this._setFileName('未命名.md');
    this.comments = [];
    this._renderComments();
    this._renderPreview();
    this._setDirty(false);
    this._autosave();
    this._setStatus(t("新建空白文档"));
    this.sourceRef.current.focus();
  }

  // ===== divider drag =====

  _applyDocumentSidebarWidth(width) {
    const sidebar = this.documentSidebarRef.current;
    if (!sidebar) return;
    const max = Math.max(220, Math.min(460, window.innerWidth * 0.42));
    this.documentSidebarWidth = Math.round(Math.max(180, Math.min(max, width || 236)));
    if (!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches)) {
      sidebar.style.width = this.documentSidebarWidth + 'px';
      sidebar.style.flexBasis = this.documentSidebarWidth + 'px';
    }
  }


  _initDocumentSidebarResize() {
    const handle = this.documentSidebarResizeRef.current;
    if (!handle) return;
    try {
      const savedWidth = Number(!window.mojianDesktop && localStorage.getItem('md-editor-document-sidebar-width'));
      if (savedWidth) this.documentSidebarWidth = savedWidth;
    } catch (e) {}
    this._applyDocumentSidebarWidth(this.documentSidebarWidth);
    let dragging = false;
    const move = (e) => {
      if (dragging) this._applyDocumentSidebarWidth(e.clientX);
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (window.mojianDesktop) this._persist(false);
      try {
        localStorage.setItem('md-editor-document-sidebar-width', String(this.documentSidebarWidth));
      } catch (e) {}
    };
    handle.addEventListener('mousedown', (e) => {
      if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) return;
      dragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }


  _initDivider() {
    const div = this.dividerRef.current, split = this.splitRef.current;
    if (!div || !split) return;
    let dragging = false;
    let pendingX = null;
    let resizeFrame = 0;
    const left = split.querySelector('.source-pane'), right = split.querySelector('.preview-pane');
    if (!left || !right) return;
    const applyPendingResize = () => {
      resizeFrame = 0;
      if (!dragging || pendingX === null) return;
      const rect = split.getBoundingClientRect();
      let ratio = (pendingX - rect.left) / rect.width;
      ratio = Math.max(0.2, Math.min(0.8, ratio));
      // 用 grow 表达比例：分屏时仍按 ratio 分配；任一栏隐藏后，剩余栏会自动铺满。
      left.style.flex = ratio + ' 1 0%';
      right.style.flex = (1 - ratio) + ' 1 0%';
    };
    div.addEventListener('mousedown', (e) => {
      dragging = true;
      div.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      pendingX = e.clientX;
      if (!resizeFrame) resizeFrame = requestAnimationFrame(applyPendingResize);
    });
    window.addEventListener('mouseup', () => {
      if (dragging && pendingX !== null) applyPendingResize();
      dragging = false;
      pendingX = null;
      div.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

}
