// @ts-nocheck
import { t, getLocale } from './i18n.ts';
import { buildBackupPackageFiles, backupZipFileName } from './annotationExport.ts';
import { buildStoredZip } from './longImageComposer.ts';

export class DesktopExportMethods {
  async _pcDownloadBackup() {
    if (this._pcBackupBusy) return false;
    this._pcBackupBusy = true;
    const name = backupZipFileName(this.fileName);
    const files = buildBackupPackageFiles(this.fileName,this.sourceRef.current.value,this.comments,type=>this._annotationTypeLabel(type),getLocale());
    this._setStatus(t('正在生成备份包…'));
    try {
      const zip = await buildStoredZip(files.map(file=>({name:file.name,data:new Blob([file.text])})));
      this._downloadBlob(zip,name);
      this._setStatus(t('备份包已交给浏览器下载：{name}',{name}));
      return true;
    } catch {
      this._setStatus(t('备份生成失败，当前文稿保留；请重试。'));
      return false;
    } finally { this._pcBackupBusy = false; }
  }

  _pcLongImageOpen() {
    if (!this._pcDesktop?.()) return;
    const overlay = this._longImageEl;
    this._pcImageOpener = this.fileMenuButtonRef.current;
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label',t('导出长图'));
    if (!this._pcImageStatus) {
      const status = document.createElement('div'); status.className = 'pc-image-status pc-editing-only'; status.role = 'status';
      const text = document.createElement('span'), progress = document.createElement('progress');
      progress.max = 1; progress.setAttribute('aria-label',t('图片生成进度')); status.append(text,progress);
      overlay.querySelector('.longimg-modal-head').after(status); this._pcImageStatus = status;
    }
    this._pcImageProgress(0,0);
    overlay.querySelector('.longimg-modal-close')?.focus({preventScroll:true});
  }

  _pcImageProgress(done = 0,total = 0,error = '') {
    if (!this._pcDesktop?.() || !this._pcImageStatus) return;
    const status = this._pcImageStatus;
    status.dataset.state = error ? 'failed' : this._longImageBusy ? 'busy' : 'idle';
    status.querySelector('span').textContent = error || t(this._longImageBusy
      ? '正在生成图片，期间不能关闭；全部成功后才下载。'
      : '图片独立于文稿保存。分页全部成功才下载 ZIP；下载位置由浏览器或系统决定。');
    const progress = status.querySelector('progress'); progress.hidden = !this._longImageBusy || !!error;
    if (total) { progress.max = total; progress.value = done; } else progress.removeAttribute('value');
  }

  _pcImageControls() {
    if (!this._pcDesktop?.()) return;
    const overlay = this._longImageEl;
    if (!overlay) return;
    if (!this._longImageBusy && this._pcImageStatus?.dataset.state === 'busy') {
      this._pcImageStatus.dataset.state = 'complete';
      this._pcImageStatus.querySelector('span').textContent = t('下载已交给浏览器，请检查下载列表。');
      this._pcImageStatus.querySelector('progress').hidden = true;
    }
    overlay.querySelector('.longimg-modal-close').disabled = !!this._longImageBusy;
    overlay.querySelectorAll('.longimg-options button,.longimg-marks-toggle').forEach(button=>{
      if (this._longImageBusy && !button.disabled) {button.dataset.pcBusyDisabled='true';button.disabled=true;}
      else if (!this._longImageBusy && button.dataset.pcBusyDisabled) {button.disabled=false;delete button.dataset.pcBusyDisabled;}
    });
  }

  _pcImageClose() {
    if (!this._pcDesktop?.()) return;
    this._pcImageOpener?.focus({preventScroll:true});
  }

  _pcHandleFileOverlayKey(event) {
    if (!this._pcDesktop?.()) return false;
    const overlay = this._longImageEl?.style.display === 'flex' ? this._longImageEl : null;
    if (!overlay) return false;
    if (event.key === 'Escape') {event.preventDefault();this.closeLongImage();return true;}
    if (event.key === 'Tab') {
      const items = [...overlay.querySelectorAll('button,input,[tabindex="0"]')].filter(node=>!node.disabled && node.getClientRects().length);
      if (!items.length) {event.preventDefault();return true;}
      const index = items.indexOf(document.activeElement);
      if (index < 0 || !event.shiftKey && index === items.length-1 || event.shiftKey && index === 0) {
        event.preventDefault();items[event.shiftKey ? items.length-1 : 0].focus();
      }
    }
    return true;
  }
}
