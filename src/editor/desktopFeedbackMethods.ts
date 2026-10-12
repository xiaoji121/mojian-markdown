// @ts-nocheck
import { t } from './i18n.ts';

export class DesktopFeedbackMethods {
  _pcConfirmDelete(comment) {
    return new Promise(resolve=>this._pcShowDialog({
      title:'删除这条批注？', message:'删除后不可恢复，相关想法和粘贴回复也会删除。',
      quote:comment.quote, confirm:'删除批注', action:()=>{resolve(true); return true;}, cancel:()=>resolve(false)
    }));
  }

  _pcShowDialog(options) {
    if (!this._pcDesktop()) return;
    this._pcCloseDialog();
    const previous = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.className = 'pc-feedback-dialog';
    dialog.setAttribute('aria-labelledby','pc-feedback-title'); dialog.setAttribute('aria-describedby','pc-feedback-description');
    const title = document.createElement('h2'); title.id = 'pc-feedback-title'; title.textContent = t(options.title);
    const description = document.createElement('p'); description.id = 'pc-feedback-description'; description.textContent = t(options.message);
    dialog.append(title,description);
    if (options.quote) { const quote = document.createElement('blockquote'); quote.textContent = options.quote; dialog.append(quote); }
    const status = document.createElement('p'); status.role = 'status'; status.className = 'pc-feedback-result'; dialog.append(status);
    const actions = document.createElement('div'); actions.className = 'pc-feedback-actions';
    const cancel = document.createElement('button'); cancel.textContent = t(options.cancel ? '取消' : '关闭');
    cancel.addEventListener('click',()=>this._pcCloseDialog());
    const confirm = document.createElement('button'); confirm.className = 'pc-feedback-confirm'; confirm.textContent = t(options.confirm);
    confirm.addEventListener('click',async()=>{
      confirm.disabled = true;
      try {
        const done = await options.action();
        if (this._pcDialog?.element !== dialog) return;
        if (done) this._pcCloseDialog();
        else { status.textContent = t('本地工作区同步未完成'); confirm.disabled = false; }
      } catch { status.textContent = t('本地工作区同步未完成'); confirm.disabled = false; }
    });
    actions.append(cancel,confirm); dialog.append(actions);
    dialog.addEventListener('cancel',event=>{event.preventDefault();this._pcCloseDialog();});
    document.body.append(dialog); this._pcDialog = {element:dialog,previous,cancel:options.cancel};
    dialog.showModal(); cancel.focus();
  }

  _pcHandleDialogKey(event) {
    if (!this._pcDialog) return false;
    if (event.key === 'Escape') { event.preventDefault(); this._pcCloseDialog(); }
    return true;
  }

  _pcCloseDialog() {
    const dialog = this._pcDialog;
    if (!dialog) return;
    this._pcDialog = null; dialog.element.close(); dialog.element.remove(); dialog.cancel?.();
    if (dialog.previous?.isConnected && dialog.previous.getClientRects().length) dialog.previous.focus({preventScroll:true});
    else this.commentsRef.current?.querySelector('.panel-close')?.focus({preventScroll:true});
  }
}
