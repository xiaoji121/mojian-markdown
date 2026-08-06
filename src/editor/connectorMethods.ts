// @ts-nocheck
// 飞书 / 钉钉连接器的前端入口：把当前文档发布成在线文档，拿回链接。
// 借飞书/钉钉现成的文档承载与分享能力，墨笺自己不做内容托管。
// 走 bridge 的 /api/publish（确定性路径），不依赖 AI 是否愿意正确调用 CLI。
import { bridgeUrl } from './bridgeClient.ts';

const TARGETS = {
  feishu: { label: '飞书文档', cli: 'lark-cli' },
  dingtalk: { label: '钉钉文档', cli: 'dws' }
};

export class ConnectorMethods {
  async _refreshConnectorCapabilities() {
    const unavailable = {
      feishu: { available: false, reason: '无法检测 lark-cli，请确认本地 Agent Bridge 已启动' },
      dingtalk: { available: false, reason: '无法检测 dws，请确认本地 Agent Bridge 已启动' }
    };
    try {
      const response = await fetch(bridgeUrl('/api/connectors'));
      if (!response.ok) throw new Error('connector check failed');
      this._applyConnectorCapabilities(await response.json());
    } catch (e) {
      this._applyConnectorCapabilities(unavailable);
    }
  }


  _applyConnectorCapabilities(capabilities) {
    const menu = this.fileMenuRef && this.fileMenuRef.current;
    if (!menu || !menu.querySelectorAll) return;
    menu.querySelectorAll('.publish-menu-item[data-target]').forEach((button) => {
      const target = button.dataset.target;
      const state = capabilities && capabilities[target];
      const available = !!state?.available;
      button.disabled = !available;
      button.title = available
        ? `上传到${TARGETS[target]?.label || '在线文档'}`
        : (state?.reason || '本地工具不可用');
      button.classList.toggle('is-unavailable', !available);
    });
  }


  publishToFeishu() {
    return this._publishTo('feishu');
  }


  publishToDingtalk() {
    return this._publishTo('dingtalk');
  }


  async _publishTo(target) {
    if (!this.agentBridgeEnabled) {
      this._setStatus('官网版暂不提供发布到' + (TARGETS[target] || {}).label + '，请使用桌面端');
      return;
    }
    if (this.publishBusy) {
      this._setStatus('正在发布上一篇，请稍候');
      return;
    }
    const label = (TARGETS[target] || {}).label || target;
    const payload = this._documentPayload();
    if (!String(payload.content || '').trim()) {
      this._setStatus('当前文档没有内容，已跳过发布');
      return;
    }

    this.publishBusy = true;
    this._setStatus('正在发布到' + label + '…');
    try {
      // 未落盘的编辑先同步进工作区，否则发布出去的是上一次的内容。
      if (typeof this._flushBridgeSync === 'function') await this._flushBridgeSync();
      const body = this.bridgeDocumentId
        ? { target, documentId: this.bridgeDocumentId }
        : { target, document: payload };
      const response = await fetch(bridgeUrl('/api/publish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || (label + '发布失败'));
      await this._notePublication(target, label, result);
    } catch (error) {
      this._setStatus((error && error.message) ? error.message : label + '发布失败');
    } finally {
      this.publishBusy = false;
    }
  }


  async _notePublication(target, label, result) {
    const url = String(result.url || '');
    if (!url) {
      // 文档大概率已经建好，只是 CLI 输出里没有链接字段：如实说明，不谎报。
      this._setStatus('已提交到' + label + '，但未拿到链接，请到' + label + '文档里确认');
      this.lastPublication = null;
      return;
    }
    this.lastPublication = { target, label: result.label || label, url };
    if (typeof this._copyText === 'function') {
      try { await this._copyText(url); } catch (e) {}
    }
    this._setStatus('已发布到' + (result.label || label) + ' · 链接已复制 · ' + url);
    if (typeof this._renderPublications === 'function') this._renderPublications();
  }


  openLastPublication() {
    const publication = this.lastPublication;
    if (!publication || !publication.url) {
      this._setStatus('还没有发布记录');
      return;
    }
    this._openExternal(publication.url);
  }


  _openExternal(url) {
    if (typeof window === 'undefined' || !window.open) return;
    window.open(url, '_blank', 'noopener');
  }


  async _copyText(text) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
  }
}
