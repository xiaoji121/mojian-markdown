// @ts-nocheck

export class EditingFileLayoutMethods {
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
    this._renderPreview();
    this._touch();
  }


  _linePrefix(prefix) {
    const src = this.sourceRef.current;
    if (!src) return;
    const val = src.value;
    let s = src.selectionStart, e = src.selectionEnd;
    let ls = val.lastIndexOf('\n', s - 1) + 1;
    const scrollTop = src.scrollTop, scrollLeft = src.scrollLeft;
    const block = val.slice(ls, e);
    const replaced = block.split('\n').map((l) => prefix + l).join('\n');
    src.value = val.slice(0, ls) + replaced + val.slice(e);
    this._restoreSourceView(src, ls, ls + replaced.length, scrollTop, scrollLeft);
    this._renderPreview();
    this._touch();
  }


  _sourceKeydown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const src = this.sourceRef.current;
      const s = src.selectionStart, en = src.selectionEnd;
      src.value = src.value.slice(0, s) + '  ' + src.value.slice(en);
      src.selectionStart = src.selectionEnd = s + 2;
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


  async onOpen() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }]
        });
        const file = await handle.getFile();
        const text = this._cleanOpenedMarkdown(await file.text());
        this.fileHandle = handle;
        this.bridgeDocumentId = null;
        this.activeDocumentId = null;
        this._setFileName(file.name);
        this.sourceRef.current.value = text;
        this.comments = [];
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
        r.onload = () => {
          this.sourceRef.current.value = this._cleanOpenedMarkdown(r.result);
          this.bridgeDocumentId = null;
          this.activeDocumentId = null;
          this._setFileName(f.name);
          this.fileHandle = null;
          this.comments = [];
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
    const content = src.value;
    if (this.fileHandle && this.fileHandle.createWritable) {
      try {
        const w = await this.fileHandle.createWritable();
        await w.write(content); await w.close();
        this._setDirty(false); this._autosave();
        this._setStatus('✓ 已保存到 ' + this.fileName);
        return;
      } catch (e) { this._setStatus('保存失败：' + (e.message || e)); return; }
    }
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: this.fileName && this.fileName !== '未命名.md' ? this.fileName : 'document.md',
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }]
        });
        const w = await handle.createWritable();
        await w.write(content); await w.close();
        this.fileHandle = handle;
        this._setFileName(handle.name);
        this._setDirty(false); this._autosave();
        this._setStatus('✓ 已保存到 ' + handle.name);
      } catch (e) {}
    } else {
      const blob = new Blob([content], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = this.fileName && this.fileName !== '未命名.md' ? this.fileName : 'document.md';
      a.click();
      URL.revokeObjectURL(a.href);
      this._setDirty(false);
      this._setStatus('✓ 已下载 ' + a.download);
    }
  }


  onNew() {
    if (this.dirty && !window.confirm('当前内容尚未保存，确定新建空白文档？')) return;
    if (this.viewMode === 'preview') this.setViewMode('editor');
    this.sourceRef.current.value = '';
    this.fileHandle = null;
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
