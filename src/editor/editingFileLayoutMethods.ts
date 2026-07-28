// @ts-nocheck
import { createDesktopFileHandle } from './desktopFileHandle.ts';

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
    value = value.replace(/<sup\b(?=[^>]*\bdata-comment-badge=)[\s\S]*?<\/sup>/gi, '');
    let previous = '';
    while (previous !== value) {
      previous = value;
      value = value.replace(/<span\b(?=[^>]*\bdata-comment-id=)[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    }
    return value;
  }


  // ===== 桌面端（Electron）文件能力：原生对话框 + 真实路径，句柄接入既有同步逻辑 =====

  _initDesktop() {
    const desktop = window.mojianDesktop;
    if (!desktop) return;
    // 网页版专属 UI（关联文件夹入口、宽屏下的 ⋯ 菜单）由 CSS 按此标记隐藏。
    document.body.classList.add('is-desktop-app');
    desktop.onMenu((action) => {
      if (action === 'new') this.onNew();
      else if (action === 'open') this.onOpen();
      else if (action === 'save') this.onSave();
      else if (action === 'save-as') this.onSaveAs();
    });
    // 双击关联的 .md 文件 / 菜单打开：主进程读好内容推送过来。
    desktop.onOpenPath((file) => { this._openDesktopFile(file); });
    desktop.consumePendingOpen()
      .then((file) => { if (file) this._openDesktopFile(file); })
      .catch(() => {});
  }


  async _openDesktopFile(picked) {
    const src = this.sourceRef.current;
    if (!picked || !picked.path || !src) return;
    const text = this._cleanOpenedMarkdown(picked.content);
    this.bridgeDocumentId = null;
    this.activeDocumentId = null;
    this._setFileName(picked.name);
    src.value = text;
    this._resetEditingHistory();
    this.comments = [];
    await this._attachLocalFile(createDesktopFileHandle(picked.path, picked.name));
    await this._adoptBridgeDocument(picked.name);
    this._renderComments();
    this._renderPreview();
    this._setDirty(false);
    this._autosave();
    this._setStatus('已打开 · ' + picked.name);
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
        this._setStatus('已打开 · ' + file.name);
      } catch (e) {}
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
          this._setStatus('已打开 · ' + f.name + '（浏览器不支持原地保存，将以下载方式保存）');
        };
        r.readAsText(f);
      };
      inp.click();
    }
  }


  async onSave() {
    const src = this.sourceRef.current;
    if (!src) return;
    if (this.fileHandle && this.fileHandle.createWritable) {
      try {
        const w = await this.fileHandle.createWritable();
        await w.write(src.value); await w.close();
        // 手动保存即用户显式决定以编辑器内容为准：更新基线并解除冲突状态。
        await this._updateLocalFileBaseline();
        this._localFileConflict = false;
        this._setDirty(false); this._autosave();
        this._setStatus('✓ 已保存到 ' + this.fileName);
      } catch (e) { this._setStatus('保存失败：' + (e.message || e)); }
      return;
    }
    // 还没有落盘目标：保存即另存为。
    await this.onSaveAs();
  }


  // 另存为：无视已关联的句柄，总是让用户挑一个新目标，保存后切换到新文件继续编辑。
  async onSaveAs() {
    const src = this.sourceRef.current;
    if (!src) return;
    const content = src.value;
    const suggested = this.fileName && this.fileName !== '未命名.md' ? this.fileName : 'document.md';
    if (window.mojianDesktop) {
      const saved = await window.mojianDesktop.saveMarkdownFileAs(suggested, content);
      if (!saved) return;
      this._setFileName(saved.name);
      await this._attachLocalFile(createDesktopFileHandle(saved.path, saved.name));
      this._setDirty(false);
      this._autosave();
      this._setStatus('✓ 已保存到 ' + saved.name);
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
        this._setFileName(handle.name);
        await this._attachLocalFile(handle);
        this._setDirty(false); this._autosave();
        this._setStatus('✓ 已保存到 ' + handle.name);
      } catch (e) {}
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggested;
    a.click();
    URL.revokeObjectURL(a.href);
    this._setDirty(false);
    this._setStatus('✓ 已下载 ' + a.download);
  }


  // ===== 顶栏「文件」下拉菜单 =====

  toggleFileMenu(force) {
    const menu = this.fileMenuRef.current;
    const button = this.fileMenuButtonRef.current;
    if (!menu) return;
    const open = typeof force === 'boolean' ? force : !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && !this._fileMenuDocH) {
      this._fileMenuDocH = (e) => {
        if (menu.contains(e.target)) return;
        if (button && (e.target === button || button.contains(e.target))) return;
        this.toggleFileMenu(false);
      };
      document.addEventListener('click', this._fileMenuDocH);
    } else if (!open && this._fileMenuDocH) {
      document.removeEventListener('click', this._fileMenuDocH);
      this._fileMenuDocH = null;
    }
  }


  onNew() {
    if (this.dirty && !window.confirm('当前内容尚未保存，确定新建空白文档？')) return;
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
    this._setStatus('新建空白文档');
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
      const savedWidth = Number(localStorage.getItem('md-editor-document-sidebar-width'));
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
    const left = split.querySelector('.source-pane'), right = split.querySelector('.preview-pane');
    if (!left || !right) return;
    div.addEventListener('mousedown', (e) => { dragging = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = split.getBoundingClientRect();
      let ratio = (e.clientX - rect.left) / rect.width;
      ratio = Math.max(0.2, Math.min(0.8, ratio));
      left.style.flex = '1 1 ' + (ratio * 100) + '%';
      right.style.flex = '1 1 ' + ((1 - ratio) * 100) + '%';
    });
    window.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; });
  }

}
