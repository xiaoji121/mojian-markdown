// @ts-nocheck
import { t } from './i18n.ts';
export class MobileEditingMethods {
  _initMobileEditing() {
    const pane=this.sourceRef.current.closest('.source-pane');
    const head=document.createElement('header');head.className='mobile-editor-head';
    head.appendChild(this._maText('h2',t('编辑 Markdown')));
    head.appendChild(this._maButton('完成',()=>{this.closeSearch();this._autosave();this.setViewMode('preview');},'data-mobile-edit-done'));
    head.appendChild(this._maText('p',this.fileName,'mobile-editor-name'));
    const status=this._maText('p','','mobile-editor-status');head.appendChild(status);pane.prepend(head);
    const more=this._maButton('更多格式',()=>this._meFormats(),'data-mobile-format-more');more.className='mobile-format-more';pane.querySelector('.source-toolbar-actions').appendChild(more);
    const backup=document.createElement('div');backup.className='mobile-editor-backup';backup.appendChild(this._maText('small',t('草稿仅在此浏览器，建议导出备份')));
    backup.appendChild(this._maButton('导出',()=>{this.toggleMobileReadingMenu(true);this._showMobileExport(true);}));pane.appendChild(backup);
    this._mePointer=e=>{if(this._isMobileAnnotation())e.preventDefault();};pane.querySelector('.pane-toolbar').addEventListener('pointerdown',this._mePointer);
    const rename=this._maButton('重命名',()=>this._mfRename(),'data-mobile-rename');rename.className='mobile-document-rename';this.documentSidebarRef.current.querySelector('.workspace-file-actions').appendChild(rename);
    const bar=this.searchBarRef.current;bar.prepend(this._maText('h2',t('查找与替换'),'mobile-search-heading'));
    const preview=this._maText('div','','mobile-search-preview');preview.setAttribute('aria-live','polite');bar.appendChild(preview);
    for(const [node,key] of [[head.querySelector('h2'),'编辑 Markdown'],[head.querySelector('button'),'完成'],[more,'更多格式'],[backup.querySelector('small'),'草稿仅在此浏览器，建议导出备份'],[backup.querySelector('button'),'导出'],[rename,'重命名'],[bar.querySelector('h2'),'查找与替换']])node.dataset.i18n=key;
    this._mfViewport=()=>{
      const v=window.visualViewport;document.documentElement.style.setProperty('--mobile-edit-height',(v?.height||innerHeight)+'px');
      document.documentElement.style.setProperty('--mobile-edit-top',(v?.offsetTop||0)+'px');
      if(!this._isMobileAnnotation()&&this._mfRoot&&!this._mfRoot.hidden)this._mfClose();
      const mobile=this._isMobileAnnotation();
      if(this._meWasMobile!==undefined&&mobile!==this._meWasMobile&&this._longImageEl?.style.display==='flex'&&!this._longImageBusy)this._refreshLongImagePoster();
      this._meWasMobile=mobile;
      if(this.searchOpen)this._meSearchPreview();
      this._mfSaveStatus();
    };
    window.addEventListener('resize',this._mfViewport);window.visualViewport?.addEventListener('resize',this._mfViewport);window.visualViewport?.addEventListener('scroll',this._mfViewport);
    this._mfViewport();
    this._meFlush=()=>{if(this._isMobileAnnotation()&&this.dirty)this._autosave();};
    window.addEventListener('pagehide',this._meFlush);window.addEventListener('beforeunload',this._meFlush);
  }
  _syncMobileEditing(){this._mfSaveStatus?.();}
  _meFormats() {
    const src=this.sourceRef.current,selection=[src.selectionStart,src.selectionEnd],scroll=src.scrollTop;
    const sheet=this._mfShow('更多格式');sheet.appendChild(this._maText('p',t('在当前光标位置插入 Markdown 标记')));
    const grid=document.createElement('div');grid.className='mobile-format-grid';
    const commands=[['heading','二级标题',()=>this._linePrefix('## ')],['quote','引用',()=>this._linePrefix('> ')],['code','行内代码',()=>this._wrapSel('`','`','code')],['list','无序列表',()=>this._linePrefix('- ')],['bold','加粗',()=>this._wrapSel('**','**',t('粗体'))],['italic','斜体',()=>this._wrapSel('*','*',t('斜体'))]];
    for(const [id,label,action] of commands){const button=this._maButton(label,()=>{this._mfClose();src.setSelectionRange(...selection);src.scrollTop=scroll;action();});button.dataset.mobileFormat=id;grid.appendChild(button);}sheet.appendChild(grid);
    sheet.appendChild(this._maButton('查找与替换',()=>{this._mfClose();src.setSelectionRange(...selection);this.openSearch(true);},'data-mobile-source-find'));
    sheet.appendChild(this._maButton('收起',()=>this._mfClose()));
  }
  _meSearchPreview() {
    if(!this._isMobileAnnotation()){this.searchBarRef.current.querySelectorAll('.search-tool').forEach(n=>n.disabled=false);return;}
    const bar=this.searchBarRef.current,preview=bar.querySelector('.mobile-search-preview'),query=this.searchInputRef.current.value;
    bar.querySelectorAll('.search-replace-btn,.search-tool:not(.search-close)').forEach(n=>n.disabled=!this._searchMatches.length||this._searchRegexInvalid);
    preview.innerHTML='';
    if(!this._searchMatches.length){preview.appendChild(this._maText('h3',t(this._searchRegexInvalid?'表达式无效':'无结果')));preview.appendChild(this._maText('p',query));preview.appendChild(this._maText('p',t('当前源文未改变')));return;}
    const value=this.sourceRef.current.value;
    for(const [index,match] of this._searchMatches.entries()){
      if(index>29)break;
      const start=value.lastIndexOf('\n',match.start-1)+1,end=value.indexOf('\n',match.end);
      const button=this._maButton('',()=>this._selectSearchMatch(index));button.className='mobile-search-result';button.setAttribute('aria-current',String(index===this._searchIndex));
      button.append(document.createTextNode(`${value.slice(0,start).split('\n').length}  ${value.slice(start,match.start)}`));
      button.appendChild(this._maText('mark',value.slice(match.start,match.end)));button.append(document.createTextNode(value.slice(match.end,end<0?value.length:end)));preview.appendChild(button);
    }
  }
  _disposeMobileEditing(){window.removeEventListener('pagehide',this._meFlush);window.removeEventListener('beforeunload',this._meFlush);window.removeEventListener('resize',this._mfViewport);window.visualViewport?.removeEventListener('resize',this._mfViewport);window.visualViewport?.removeEventListener('scroll',this._mfViewport);this._disposeMobileFiles();}
}
