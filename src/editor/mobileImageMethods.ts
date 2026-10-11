// @ts-nocheck
import { t } from './i18n.ts';
export class MobileImageMethods {
  _miShow() {
    this._longImageEl.classList.toggle('is-mobile-export',this._isMobileAnnotation()&&!this._longImageSelection);
    if(!this._isMobileAnnotation()||this._longImageSelection)return;
    this._longImageReturnFocus=document.activeElement;
    this._miInert=[...document.body.children].filter(n=>n!==this._longImageEl).map(n=>[n,n.inert]);this._miInert.forEach(([n])=>n.inert=true);
    if(!this._miKey){this._miKey=e=>{
      if(!this._miInert||this._longImageEl.style.display!=='flex')return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.closeLongImage();}
      if(e.key==='Tab'){const nodes=[...this._longImageEl.querySelectorAll('button')].filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    };document.addEventListener('keydown',this._miKey,true);}
    const overlay=this._longImageEl;overlay.classList.add('is-mobile-export');
    overlay.querySelector('.longimg-modal-title').textContent=t('导出长图');
    const foot=overlay.querySelector('.longimg-modal-foot');
    let note=foot.querySelector('.mobile-image-note');
    if(!note){note=this._maText('p','','mobile-image-note');foot.appendChild(note);}
    note.textContent=t('单页为 PNG，多页为 PNG ZIP。下载后请确认文件已保存。');
    this._miProgress(0,0);
    overlay.querySelector('.longimg-modal-close').focus({preventScroll:true});
  }
  _miProgress(done,total,error='') {
    if(!this._isMobileAnnotation()||this._longImageSelection)return;
    const foot=this._longImageEl.querySelector('.longimg-modal-foot');let node=foot.querySelector('.mobile-image-progress');
    if(!node){node=this._maText('p','','mobile-image-progress');node.setAttribute('role','status');foot.appendChild(node);}
    node.textContent=error?`${t('生成失败，当前草稿不受影响。请重试。')} ${done}/${total} · ${error}`:total?`${t('正在生成…')} ${done}/${total}`:'';
    this._miError=error;
    this._miGenerated=done;this._miTotal=total;
  }
  _miDownload(name) {if(this._isMobileAnnotation())this._miDownloadedName=name;}
  _miClose() {
    this._miInert?.forEach(([n,inert])=>n.inert=inert);this._miInert=null;
    if(!this._isMobileAnnotation())return;
    if(this._miDownloadedName){const name=this._miDownloadedName;this._miDownloadedName='';this._mfDownloaded(name);}
    else if(!this._longImageSelection){this.toggleMobileReadingMenu(true);this._showMobileExport(true);}
  }
  _disposeMobileImages(){document.removeEventListener('keydown',this._miKey,true);this._miInert?.forEach(([n,inert])=>n.inert=inert);this._miInert=null;}
  _miPageControls() {
    if(!this._isMobileAnnotation()||this._longImageSelection)return;
    const stage=this._longImageStageEl,pages=[...stage.querySelectorAll('.longimg-page-preview')];
    this._longImageEl.querySelector('.mobile-image-pages')?.remove();if(pages.length<2)return;
    const controls=document.createElement('div');controls.className='mobile-image-pages';let index=0;
    const label=this._maText('span','');
    const show=()=>{pages.forEach((p,i)=>p.hidden=i!==index);label.textContent=`${index+1} / ${pages.length}`;prev.disabled=!index;next.disabled=index===pages.length-1;};
    const prev=this._maButton('上一页',()=>{index--;show();});const next=this._maButton('下一页',()=>{index++;show();});controls.append(prev,label,next);
    this._longImageEl.querySelector('.longimg-stage-wrap').appendChild(controls);show();
  }
  _miFitPreview() {
    if(!this._isMobileAnnotation()||this._longImageSelection)return;
    const width=parseFloat(this._longImageStageEl.style.width)||900;
    const paged=!!this._longImageStageEl.querySelector('.longimg-page-stack');
    const ratio=Math.min(Math.min(320,window.innerWidth-96)/width,paged?(window.innerHeight*.23)/1440:1);
    const height=this._longImageStageEl.firstElementChild?.offsetHeight||0;
    this._longImageStageEl.style.transform=`scale(${ratio})`;
    this._longImageBoxEl.style.width=Math.round(width*ratio)+'px';this._longImageBoxEl.style.height=Math.round(height*ratio)+'px';
  }
  _miControls() {if(this._isMobileAnnotation()&&!this._longImageSelection&&this._miError&&!this._longImageBusy)this._longImageSaveEl.textContent=t('重试生成');}
}
