// @ts-nocheck
import { t } from './i18n.ts';
import { describeAIReadiness } from './aiReadinessMethods.ts';

export class DesktopAIMethods {
  _initDesktopAI() {
    const panel = this.aiPanelRef.current;
    if (!panel || this._pcAIState) return;
    const state = document.createElement('p'); state.className = 'pc-ai-state pc-editing-only'; state.role = 'status';
    panel.querySelector('.workspace-ai-tools').after(state); this._pcAIState = state;
    const hint = document.createElement('p'); hint.className = 'pc-ai-busy-hint pc-editing-only'; hint.id = 'pc-ai-busy-hint';
    panel.querySelector('.ai-composer').prepend(hint); this._pcAIHint = hint;
    this.aiInputRef.current?.addEventListener('input',()=>this._pcSyncAI());
    this._pcSyncAI();
  }

  _pcSyncAI() {
    if (!this._pcDesktop?.() || !this._pcAIState) return;
    const summary = describeAIReadiness(this.aiReadiness,this.aiEngine);
    const busy = this.aiBusy || this._aiPreflightBusy;
    const failed = this.aiMessages?.at(-1)?.failed;
    const key = this.aiBusy ? '正在生成回复…' : this._aiPreflightBusy ? '正在检查渠道…'
      : failed ? '请求未完成，可从原问题重试。' : summary.canRequest ? '渠道可调用，登录或密钥有效性尚未验证。' : '等待配置可用渠道';
    this._pcAIState.textContent = t(key); this._pcAIState.dataset.state = busy ? 'busy' : failed ? 'failed' : summary.canRequest ? 'ready' : 'unavailable';
    this._pcAIHint.hidden = !this.aiBusy;
    this._pcAIHint.textContent = t('关闭面板不会停止请求；请等待完成后再切换文稿。');
    const send = this.aiSendRef.current;
    if (send) send.disabled = !!busy || !summary.canRequest || !this.aiInputRef.current?.value.trim();
    this.aiPanelRef.current.querySelectorAll('.ai-message-retry').forEach(button=>{if(busy)button.disabled=true;});
  }

  _pcAIPanelFocus(open) {
    if (!this._pcDesktop?.()) return;
    if (open) this._pcAIOpener = document.activeElement;
    else if (this._pcAIOpener?.isConnected && this._pcAIOpener.getClientRects().length) this._pcAIOpener.focus({preventScroll:true});
    this._pcSyncAI();
  }
}
