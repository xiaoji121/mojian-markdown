// @ts-nocheck
// 划词翻译：调用用户在 AI 设置里配置的 Gemini Key（/api/translate），
// 译文流式渲染到选区附近的浮层；未配置 Key 时浮层里给「去配置」入口。
import { bridgeUrl } from './bridgeClient.ts';

export class TranslateMethods {
  async translateSel() {
    if (!this.agentBridgeEnabled) {
      this._setStatus('官网版暂不提供翻译，请使用本地完整版');
      return;
    }
    const p = this._pending;
    if (!p || !p.quote) return;
    const bar = this.selBarRef.current;
    const anchor = bar ? { left: bar.style.left, top: bar.style.top } : { left: '50%', top: '20%' };
    if (bar) bar.style.display = 'none';
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
    const popover = this._buildTranslatePopover();
    popover.style.left = anchor.left;
    popover.style.top = anchor.top;
    popover.style.display = 'flex';
    this._translateBody.textContent = '正在翻译…';
    await this._streamTranslation(p.quote);
  }


  // 浮层每次翻译重建，避免残留上一次的译文与按钮。
  _buildTranslatePopover() {
    if (this._translatePopoverEl && this._translatePopoverEl.remove) this._translatePopoverEl.remove();
    const pop = document.createElement('div');
    pop.className = 'translate-popover';
    const head = document.createElement('div');
    head.className = 'translate-popover-head';
    const title = document.createElement('strong');
    title.className = 'translate-popover-title';
    title.textContent = '翻译 · Gemini';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'translate-popover-close';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭翻译');
    close.addEventListener('click', () => this._hideTranslatePopover());
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'translate-popover-body';
    const actions = document.createElement('div');
    actions.className = 'translate-popover-actions';
    pop.append(head, body, actions);
    document.body.appendChild(pop);
    this._translatePopoverEl = pop;
    this._translateBody = body;
    this._translateActions = actions;
    this._bindTranslateDismiss();
    return pop;
  }


  _bindTranslateDismiss() {
    if (this._translateDismissBound || !document.addEventListener) return;
    document.addEventListener('mousedown', (e) => {
      const pop = this._translatePopoverEl;
      if (pop && pop.style.display !== 'none' && !pop.contains(e.target)) this._hideTranslatePopover();
    });
    this._translateDismissBound = true;
  }


  _hideTranslatePopover() {
    if (this._translatePopoverEl) this._translatePopoverEl.style.display = 'none';
  }


  async _streamTranslation(text) {
    const body = this._translateBody;
    const actions = this._translateActions;
    try {
      const response = await fetch(bridgeUrl('/api/translate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok || !response.body) throw new Error('本地 Agent Bridge 无响应');
      const translated = await this._consumeTranslateStream(response, body);
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'tbtn translate-popover-copy';
      copy.textContent = '复制译文';
      copy.addEventListener('click', () => this._copy(translated, '已复制译文', copy));
      actions.appendChild(copy);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      body.textContent = message;
      if (/API Key/i.test(message)) {
        const config = document.createElement('button');
        config.type = 'button';
        config.className = 'tbtn translate-open-settings';
        config.textContent = '去配置';
        config.addEventListener('click', () => { this._hideTranslatePopover(); this.openAISettings(); });
        actions.appendChild(config);
      }
    }
  }


  async _consumeTranslateStream(response, bodyEl) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let translated = '';
    let failed = null;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const packets = buffer.split('\n\n');
      buffer = packets.pop() || '';
      for (const packet of packets) {
        let event = 'message', data = null;
        packet.split('\n').forEach((line) => {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) {
            try { data = JSON.parse(line.slice(5).trim()); } catch (e) {}
          }
        });
        if (event === 'delta' && data && data.text) {
          translated += data.text;
          bodyEl.textContent = translated;
        } else if (event === 'error' && data) {
          failed = data.message || '翻译失败';
        }
      }
    }
    if (failed) throw new Error(failed);
    if (!translated) throw new Error('没有返回译文');
    return translated;
  }
}
