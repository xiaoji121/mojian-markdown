// @ts-nocheck
import { t } from './i18n.ts';
import { annotationDraftDirty } from './mobileAnnotationDraft.ts';
import { getEditorStorageError } from './storage.ts';
export class MobileFileMethods {
  _mfShow(title, full = false) {
    this._mfImportToken=(this._mfImportToken||0)+1;
    this.closeDocumentSidebar(); this.toggleMobileReadingMenu(false);
    if (!this._mfRoot) {
      this._mfRoot = document.createElement('div');this._mfRoot.className='mobile-file-overlay';this._mfRoot.hidden=true;document.body.appendChild(this._mfRoot);
      this._mfKey=e=>{
        if(this._mfRoot.hidden)return;
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this._mfClose();}
        if(e.key==='Tab'){
          const nodes=[...this._mfRoot.querySelectorAll('button,input')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
          const first=nodes[0],last=nodes.at(-1);
          if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
          else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
        }
      };document.addEventListener('keydown',this._mfKey,true);
    }
    if(this._mfRoot.hidden!==false){
      this._mfFocus=document.activeElement;
      this._mfInert=[...document.body.children].filter(n=>n!==this._mfRoot).map(n=>[n,n.inert]);this._mfInert.forEach(([n])=>n.inert=true);
    }
    this._mfRoot.hidden=false;this._mfRoot.innerHTML='';this._mfRoot.classList.toggle('is-full',full);
    const backdrop=this._maButton('关闭',()=>this._mfClose());backdrop.className='mobile-file-backdrop';backdrop.tabIndex=-1;
    const sheet=document.createElement('section');sheet.className='mobile-file-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label',t(title));
    const head=document.createElement('header');head.appendChild(this._maText('h2',t(title)));
    const close=this._maButton('关闭',()=>this._mfClose(),'data-mobile-file-cancel');head.appendChild(close);sheet.appendChild(head);
    this._mfRoot.append(backdrop,sheet);this._mfViewport?.();close.focus({preventScroll:true});return sheet;
  }
  _mfClose() {
    if(!this._mfRoot)return;this._mfRoot.hidden=true;this._mfRoot.innerHTML='';this._mfImportToken=(this._mfImportToken||0)+1;
    this._mfInert?.forEach(([n,inert])=>n.inert=inert);this._mfInert=null;
    if(this._mfFocus?.isConnected&&!this._mfFocus.closest('[inert]')&&this._mfFocus.getClientRects().length)this._mfFocus.focus({preventScroll:true});
  }
  _mfDraftBlocked() {
    if(!annotationDraftDirty(this._maDraft)&&!annotationDraftDirty(this._maRecoveredDraft()))return false;
    const sheet=this._mfShow('请先保存或放弃之前的草稿');sheet.appendChild(this._maText('p',t('未保存的批注草稿不会包含在 ZIP 备份中。请回到批注继续编辑。')));
    sheet.appendChild(this._maButton('继续编辑未保存的草稿',()=>{this._mfClose();this._maList();},'data-mobile-file-resume'));return true;
  }
  _mfProtect(kind, proceed) {
    if(this._mfDraftBlocked())return;
    // 当前这篇能完整留在最近阅读里：直接换，不再弹「替换当前内容」；落库失败才回到原确认。
    if(this._webRecentKeepsCurrent?.()){
      const previous=this.fileName;
      void this._webRecentSaveCurrent().then(ok=>{
        if(!ok){this._mfProtectSheet(kind,proceed);return;}
        proceed();if(previous&&previous!==this.fileName)this._setStatus?.(t('上一篇已留在最近阅读 · {name}',{name:previous}));
      });return;
    }
    this._mfProtectSheet(kind,proceed);
  }
  _mfProtectSheet(kind, proceed) {
    const sheet=this._mfShow(kind==='new'?'新建前，先留一份备份':'导入会替换当前内容');
    sheet.appendChild(this._maText('p',t('正文、批注、编辑历史和文件关联将被重置。取消会保留当前草稿。')));
    sheet.appendChild(this._maText('p',`${this.fileName} · ${this.comments.length} ${t('批注')}`,'mobile-file-card'));
    sheet.appendChild(this._maText('p',t('ZIP 包含源文与已保存批注，暂不支持直接导入恢复。下载后请确认文件已保存。')));
    sheet.appendChild(this._maButton('先下载 ZIP 备份',()=>this._mfExport('backup',true),'data-mobile-file-backup'));
    sheet.appendChild(this._maButton(kind==='new'?'清空并新建':'确认替换',()=>{this._mfClose();proceed();},'data-mobile-file-confirm'));
    sheet.appendChild(this._maButton('取消，保留当前草稿',()=>this._mfClose(),'data-mobile-file-cancel'));
  }
  _mfNew() {this._mfProtect('new',()=>{
    if(window.mojianDesktop){this._mfApprovedNew=true;try{this.onNew();}finally{this._mfApprovedNew=false;}}
    else if(this._mfApplyImport(t('未命名.md'),''))this.setViewMode('editor');
  });}
  _mfImport() {
    if(this._mfDraftBlocked())return;
    const sheet=this._mfShow('导入 Markdown',true);
    sheet.appendChild(this._maText('h3',t('把已有文字带进墨笺')));
    sheet.appendChild(this._maText('p',t(this._webRecentKeepsCurrent?.()?'选择 .md、.markdown 或 .txt 文件。':'选择 .md、.markdown 或 .txt 文件。先完整读取，再确认替换当前文稿。')));
    sheet.appendChild(this._maButton('选择 Markdown 文件',()=>this._mfPick(),'data-mobile-file-pick'));
    sheet.appendChild(this._maText('p',t('导入仅作为浏览器草稿，不会写回手机原文件。')));
    if(this._webRecentKeepsCurrent?.()){sheet.appendChild(this._maText('p',t('当前这篇会留在最近阅读里，导入后随时可以切回。'),'mobile-file-card'));return;}
    sheet.appendChild(this._maText('p',t('正文、批注、编辑历史和文件关联将被重置。取消会保留当前草稿。'),'mobile-file-card'));
    sheet.appendChild(this._maButton('先下载 ZIP 备份',()=>this._mfExport('backup',true),'data-mobile-file-backup'));
    sheet.appendChild(this._maText('p',t('ZIP 包含源文与已保存批注，暂不支持直接导入恢复。下载后请确认文件已保存。')));
  }
  _mfPick() {
    if(this._mfReading)return;
    const input=document.createElement('input');input.type='file';
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file)return;
      const token=this._mfImportToken=(this._mfImportToken||0)+1;
      const key=this._annotationDocumentKey();this._mfReading=true;
      try {
        if(!/\.(md|markdown|txt)$/i.test(file.name))throw Error(t('请选择 Markdown 或文本文件'));
        const text=this._cleanOpenedMarkdown(await file.text());
        if(token!==this._mfImportToken||this._mfRoot.hidden)return;
        this._mfProtect('import',async()=>{
          if(key!==this._annotationDocumentKey()){this._mfFailure('当前文稿已改变，请重新选择文件',()=>this._mfImport());return;}
          // 同名文档认领最近阅读里的原记录，不再每导一次多一条。
          const adopted=await this._webRecentResolveImport?.(file.name,text)??null;
          this._mfApplyImport(file.name,text,adopted,true);
        });
      } catch(error) {if(token===this._mfImportToken&&!this._mfRoot.hidden)this._mfFailure('文件读取失败',()=>this._mfImport(),error.message);}
      finally {this._mfReading=false;}
    });input.click();
  }
  _mfApplyImport(name,text,adopted=null,fromFile=false) {
    const src=this.sourceRef.current;
    const previous={value:src.value,fileName:this.fileName,comments:this.comments,bridgeDocumentId:this.bridgeDocumentId,activeDocumentId:this.activeDocumentId};
    src.value=text;this._setFileName(name);this.comments=[];this.bridgeDocumentId=null;this.activeDocumentId=null;
    if(fromFile)this._webRecentApplyImport?.(adopted,text);
    if(this._persist()===false){
      src.value=previous.value;this._setFileName(previous.fileName);this.comments=previous.comments;this.bridgeDocumentId=previous.bridgeDocumentId;this.activeDocumentId=previous.activeDocumentId;
      this._mfFailure('草稿保存失败 · 请保存到文件',()=>this._mfApplyImport(name,text));return false;
    }
    if(this._saveT){clearTimeout(this._saveT);this._saveT=null;}
    this._detachLocalFile();this._resetEditingHistory();
    this._maClearDraft();this._renderComments();this._renderPreview();this._setDirty(false);this._autosave();
    this._mfClose();this.setViewMode('preview');this._syncMobileEditing?.();return true;
  }
  _mfFailure(title,retry,message='') {
    const sheet=this._mfShow(title);sheet.appendChild(this._maText('p',message));
    sheet.appendChild(this._maText('p',t('当前正文和批注仍然保留'),'mobile-file-card'));
    sheet.appendChild(this._maButton('重试',retry,'data-mobile-file-retry'));
    sheet.appendChild(this._maButton('返回',()=>this._mfClose(),'data-mobile-file-cancel'));
  }
  async _mfExport(kind, stay=false) {
    if(this._mfExportBusy)return;
    if(this._mfDraftBlocked())return;
    this._mfExportBusy=true;
    const token=this._mfImportToken;
    try {
      if(kind==='backup')await this.downloadFullBackup();
      else if(kind==='source')this.downloadSourceMarkdown();
      else this.downloadAnnotationsMarkdown();
      if(token!==this._mfImportToken)return;
      if(stay){this._mfRoot.querySelector('.mobile-file-sheet')?.appendChild(this._maText('p',t('已发起下载，请在下载记录中确认文件已保存。当前草稿仍然保留。'),'mobile-file-card'));}
      else this._mfDownloaded(this._mfLastDownloadedName||this.fileName);
    } catch(error){if(token===this._mfImportToken)this._mfFailure('导出失败',()=>this._mfExport(kind,stay),error.message);}
    finally{this._mfExportBusy=false;}
  }
  _mfDownloaded(name) {
    const sheet=this._mfShow('已发起下载');sheet.appendChild(this._maText('h3',name));
    sheet.appendChild(this._maText('p',t('已发起下载，请在下载记录中确认文件已保存。当前草稿仍然保留。'),'mobile-file-card'));
    sheet.appendChild(this._maButton('回到正文',()=>{this._mfClose();this.setViewMode('preview');},'data-mobile-file-reading'));
    sheet.appendChild(this._maButton('返回导出选项',()=>{this._mfClose();this.toggleMobileReadingMenu(true);this._showMobileExport(true);},'data-mobile-file-export'));
  }
  _mfRename() {
    if(this._mfDraftBlocked())return;
    const sheet=this._mfShow('重命名',true);const input=document.createElement('input');input.value=this.fileName;input.setAttribute('aria-label',t('文档名'));sheet.appendChild(input);
    const note=this._maText('p',t('重命名不改变正文或批注'));sheet.appendChild(note);
    const save=this._maButton('保存',async()=>{
      const name=this._normalizedFileName(input.value);if(!name){note.textContent=t('文档名不能为空');return;}
      if(save.disabled)return;save.disabled=true;
      if(this.fileHandle&&!(await this._renameLocalFile(name))){save.disabled=false;note.textContent=t('重命名失败');return;}
      const previous=this.fileName;this._setFileName(name);
      if(this._persist()===false){this._setFileName(previous);save.disabled=false;note.textContent=t('草稿保存失败 · 请保存到文件');return;}
      this._mfClose();this.toggleDocumentSidebar(true);
    },'data-mobile-file-rename');sheet.appendChild(save);input.focus();input.select();
  }
  _mfSaveStatus() {
    const status=document.querySelector('.mobile-editor-status');if(!status)return;
    const name=document.querySelector('.mobile-editor-name');if(name)name.textContent=this.fileName;
    status.textContent=t(getEditorStorageError()?'草稿保存失败 · 请保存到文件':this.fileHandle||this.localFilePath?(this.dirty?'未写回文件':'已保存'):'仅浏览器草稿');
    if(this._isMobileAnnotation()&&getEditorStorageError()){
      if(this.persistStatusRef?.current)this.persistStatusRef.current.textContent=t('草稿保存失败 · 请保存到文件');
      const header=document.querySelector('.workspace-save-label');if(header)header.textContent=t('草稿保存失败 · 请保存到文件');
    }
  }
  _disposeMobileFiles(){document.removeEventListener('keydown',this._mfKey,true);this._mfClose();this._mfRoot?.remove();}
}
