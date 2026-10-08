// @ts-nocheck
import { bridgeUrl } from './bridgeClient.ts';

// A filesystem check is not authentication or a live provider test.
export function describeAIReadiness(status, engine) {
  if (!status?.bridgeAvailable) return { canRequest: false, text: '本地 AI 服务未连接。可重试，或继续编辑。' };
  const provider = status.providers?.[engine];
  if (engine !== 'gemini') {
    const name = engine === 'codex' ? 'Codex' : 'Claude';
    if (provider?.executable === 'found') return {
      canRequest: true, text: `${name} CLI 已找到；登录尚未验证。首次提问会调用 CLI，请先在终端完成登录。`
    };
    const reason = { missing: '未找到', unsupported: '启动器不受支持', unavailable: '暂时无法检查' }[provider?.executable] || '尚未检查';
    return { canRequest: false, text: `${name} CLI ${reason}。请安装并登录后重新检查，或在设置中选择其他渠道。` };
  }
  if (provider?.credentialStatus === 'migration-required') return { canRequest: false, text: 'Gemini 旧密钥等待你在设置中同意安全迁移。' };
  if (['locked', 'unsupported', 'unavailable'].includes(provider?.storage)) {
    const reason = { locked: '已锁定', unsupported: '不支持此平台', unavailable: '暂不可用' }[provider.storage];
    return { canRequest: false, text: `Gemini 安全存储${reason}。不会回退明文；可继续编辑或选择本地 CLI。` };
  }
  if (!provider?.configured) return { canRequest: false, text: 'Gemini 尚未配置 API Key。划词翻译始终需要 Gemini，与问答渠道无关。' };
  return { canRequest: true, text: 'Gemini Key 已配置；有效性和网络尚未验证。' + (provider.storage === 'plaintext' ? '命令行网页版使用明文存储。' : '') };
}

export function aiRequestContext(editor) {
  return JSON.stringify([
    editor.bridgeDocumentId, editor.activeDocumentId, editor.localFilePath,
    editor.fileName, editor.activeAnswerRequestId, editor.previewOverrideMarkdown,
    editor.aiQuote, editor.aiOccurrence, editor.aiStart, editor.sourceRef?.current?.value
  ]);
}

export class AIReadinessMethods {
  async _refreshAIReadiness() {
    const epoch = this._aiReadinessEpoch = (this._aiReadinessEpoch || 0) + 1;
    this._aiReadinessAbort?.abort();
    const controller = new AbortController();
    this._aiReadinessAbort = controller;
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(bridgeUrl('/api/readiness'), { signal: controller.signal });
      if (!response.ok) throw new Error('Readiness unavailable');
      const result = await response.json();
      if (epoch !== this._aiReadinessEpoch) return false;
      this.aiReadiness = result;
      this.aiBridgeOnline = result.bridgeAvailable === true;
    } catch {
      if (epoch !== this._aiReadinessEpoch) return false;
      this.aiReadiness = { bridgeAvailable: false };
      this.aiBridgeOnline = false;
    } finally {
      clearTimeout(timer);
      if (epoch === this._aiReadinessEpoch) this._aiReadinessAbort = null;
    }
    this._renderAIReadiness();
    this._setAIStatus(this.aiBridgeOnline ? '本地 AI 服务已连接 · 渠道状态见下方' : '本地 AI 服务未连接', this.aiBridgeOnline ? 'online' : 'offline');
    return true;
  }

  _renderAIReadiness() {
    const host = this.aiReadinessRef?.current;
    if (!host) return;
    const summary = describeAIReadiness(this.aiReadiness, this.aiEngine);
    if (this._aiReadinessText) {
      this._aiReadinessText.textContent = summary.text;
      return;
    }
    const text = document.createElement('p');
    this._aiReadinessText = text;
    text.setAttribute('role', 'status');
    text.textContent = summary.text;
    const actions = document.createElement('div');
    actions.className = 'ai-readiness-actions';
    const button = (label, action) => {
      const element = document.createElement('button');
      element.type = 'button'; element.className = 'tbtn'; element.textContent = label;
      element.addEventListener('click', action); actions.appendChild(element);
      return element;
    };
    button('配置 AI', () => this.openAISettings());
    const retry = button('重新检查', async () => {
      if (retry.getAttribute('aria-disabled') === 'true') return;
      retry.setAttribute('aria-disabled', 'true');
      try { await this._refreshAIReadiness(); }
      finally { retry.setAttribute('aria-disabled', 'false'); }
    });
    button('继续编辑，不使用 AI', () => {
      this._openAIPanel(false);
      this.sourceRef?.current?.focus();
    });
    host.append(text, actions);
  }

  async _ensureAIReady(engine = this.aiEngine) {
    if (!await this._refreshAIReadiness()) return false;
    const summary = describeAIReadiness(this.aiReadiness, engine);
    if (!summary.canRequest) this._setStatus(summary.text);
    return summary.canRequest;
  }
}
