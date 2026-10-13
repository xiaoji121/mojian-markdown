// @ts-nocheck
import { t, getLocale } from './i18n.ts';
import { buildBackupPackageFiles } from './annotationExport.ts';

export class DesktopFileMethods {
  _pcCanChangeDocument() {
    if (!this._pcDesktop?.()) return true;
    if (!this.aiBusy && !this._aiPreflightBusy && !this._pcSavePending) return true;
    this._setStatus(t('请等待当前操作完成后再切换文稿。'));
    return false;
  }

  _pcConfirmReplacement(kind) {
    if (!this._shouldConfirmLeave()) return Promise.resolve(true);
    return new Promise(resolve=>this._pcShowDialog({
      title:kind === 'new' ? '新建文稿？' : '打开另一篇文稿？',
      message:'当前正文、批注和文件关联将被替换。如需保留，请取消并先保存或导出备份。',
      confirm:kind === 'new' ? '新建文稿' : '打开文件',
      action:()=>{resolve(true);return true;},cancel:()=>resolve(false)
    }));
  }

  async _pcNewFile() {
    if (this._pcFileBusy || !this._pcCanChangeDocument()) return;
    this._pcFileBusy = true;
    try {
      if (!await this._pcPrepareReplacement('new')) return;
      if (!this._pcCanChangeDocument()) return;
      this._pcResetFileContext(); this.onNew(true);
    } finally { this._pcFileBusy = false; }
  }

  _pcResetFileContext() {
    if (this._saveT) { clearTimeout(this._saveT); this._saveT = null; }
    if (this._bridgeSyncT) { clearTimeout(this._bridgeSyncT); this._bridgeSyncT = null; }
    this._pcFileProblem('');
    this.aiMessages = []; this.aiQuote = ''; this._pcBridgeState = null;
    this._renderAIMessages(); this._renderAIQuote();
  }

  async _pcOpenFile() {
    if (this._pcFileBusy || !this._pcCanChangeDocument()) return;
    this._pcFileBusy = true;
    try {
      if (window.mojianDesktop) {
        const picked = await window.mojianDesktop.openMarkdownFile();
        if (picked) await this._pcAcceptDesktopFile(picked);
        return;
      }
      let handle, file;
      if (window.showOpenFilePicker) {
        [handle] = await window.showOpenFilePicker({types:[{description:'Markdown',accept:{'text/markdown':['.md','.markdown','.txt']}}]});
        file = await handle.getFile();
      } else file = await this._pcPickImport();
      if (!file) return;
      const text = this._cleanOpenedMarkdown(await file.text());
      if (!await this._pcPrepareReplacement()) return;
      this._pcResetFileContext(); this._detachLocalFile();
      this.bridgeDocumentId = null; this.activeDocumentId = null;
      this.sourceRef.current.value = text; this._resetEditingHistory();
      this._setFileName(file.name); this.comments = [];
      // Read succeeded before replacement; permission failure leaves the opened draft editable.
      if (handle) await this._attachLocalFile(handle,{requestWrite:true});
      await this._adoptBridgeDocument(file.name);
      this._renderComments(); this._renderPreview(); this._setDirty(this.sourceRef.current.value !== text);
      this._autosave(); this._setStatus(t('已打开 · {name}',{name:file.name}));
    } catch (error) {
      this._setStatus(error?.name === 'AbortError' ? t('已取消打开，当前文稿保留。') : t('打开失败 · {error}',{error:error?.message || t('未知错误')}));
    } finally { this._pcFileBusy = false; }
  }

  _pcPickImport() {
    return new Promise(resolve=>{
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.md,.markdown,.txt';
      input.addEventListener('change',()=>resolve(input.files?.[0] || null),{once:true});
      input.addEventListener('cancel',()=>resolve(null),{once:true}); input.click();
    });
  }

  async _pcPrepareReplacement(kind = 'open') {
    if (!this._pcCanChangeDocument() || !await this._pcConfirmReplacement(kind)) return false;
    const snapshot = this._pcDocumentSnapshot();
    await this._localWritePromise;
    await this._bridgeSyncPromise;
    return this._pcCanChangeDocument() && !this._pcDocumentChanged(snapshot);
  }

  async _pcAcceptDesktopFile(picked) {
    if (!picked?.path) return false;
    if (!await this._pcPrepareReplacement()) return false;
    this._pcResetFileContext();
    await this._openDesktopFile(picked,true);
    return true;
  }

  async _pcRunSave(as) {
    if (this._pcSavePending) return false;
    this._pcSavePending = true; this._pcWriteFailed = false;
    this._setStatus(t('正在保存文件…'));
    try { await (as ? this.onSaveAs(true) : this.onSave(true)); }
    finally { this._pcSavePending = false; }
    if (!this._pcWriteFailed && !this.dirty) this._pcFileProblem('');
    return !this._pcWriteFailed && !this.dirty;
  }

  _pcFileProblem(kind) {
    if (!this._pcDesktop?.()) return;
    this._pcFileProblemKind = kind;
    if (!this._pcFileBanner) {
      const banner = document.createElement('div'); banner.className = 'pc-file-warning pc-editing-only'; banner.role = 'status';
      const message = document.createElement('span'), action = document.createElement('button');
      action.addEventListener('click',()=>this._pcShowFileProblem()); banner.append(message,action);
      document.querySelector('.app-shell').append(banner); this._pcFileBanner = banner;
    }
    const banner = this._pcFileBanner; banner.hidden = !kind;
    banner.querySelector('span').textContent = t(kind === 'conflict' ? '外部文件已修改，自动保存暂停。' : '文稿尚未写入文件，当前修改保留。');
    banner.querySelector('button').textContent = t('查看处理方式');
  }

  _pcWriteFailure() {
    if (!this._pcDesktop?.()) return;
    this._pcWriteFailed = true; this._setDirty(true); this._pcFileProblem('write');
    if (!this._pcDialog) this._pcShowFileProblem();
  }

  _pcShowFileProblem() {
    const conflict = this._pcFileProblemKind === 'conflict';
    this._pcShowDialog({title:conflict ? '文件在外部发生了修改' : '文稿尚未写入文件',
      message:conflict ? '当前也有未保存修改。显式保存将覆盖外部变化，请先核对或另存为。' : '当前修改仍保留。请检查文件权限或位置，再重试保存或另存为。',
      confirm:conflict ? '另存为…' : '重试保存', action:()=>this._pcRunSave(conflict)});
    this._pcDialog.previous = this.fileMenuButtonRef.current;
    if (!conflict) {
      const button = document.createElement('button'); button.textContent = t('另存为…');
      button.addEventListener('click',async()=>{if(await this._pcRunSave(true))this._pcCloseDialog();});
      this._pcDialog.element.querySelector('.pc-feedback-actions').prepend(button);
    }
  }

  _initDesktopFiles() {
    const menu = this.fileMenuRef.current;
    if (!menu || menu.querySelector('.pc-export-description')) return;
    const description = document.createElement('p'); description.className = 'pc-export-description pc-editing-only';
    description.dataset.i18n = '备份 ZIP：原文 MD、批注 MD 与 JSON；不含 ZIP 导入恢复。'; description.textContent = t(description.dataset.i18n);
    menu.prepend(description);
    const button = document.createElement('button'); button.className = 'header-menu-item pc-export-json pc-editing-only'; button.role = 'menuitem';
    button.dataset.i18n = '下载批注 JSON'; button.textContent = t(button.dataset.i18n);
    button.addEventListener('click',()=>{
      this.toggleFileMenu(false);
      const file = buildBackupPackageFiles(this.fileName,this.sourceRef.current.value,this.comments,type=>this._annotationTypeLabel(type),getLocale()).find(file=>file.name.endsWith('.json'));
      this._downloadTextFile(file.text,file.name,'application/json;charset=utf-8');
      this._setStatus(t('下载已交给浏览器，请检查下载列表。'));
    });
    menu.insertBefore(button,menu.querySelector('.longimg-entry'));
  }
}
