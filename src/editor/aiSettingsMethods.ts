// @ts-nocheck
// 产品级「设置」弹窗（顶栏 ⚙ 进入）。目前只有 AI 渠道一节，按两类渠道组织：
//   本地 Agent 渠道 —— Claude / Codex，调用本机已登录的 CLI，无需 Key；
//   API Key 渠道 —— 目前支持 Gemini，Key 保存在本机 Reading Workspace 的
//     settings.json，界面上永远只显示尾号掩码，不回显明文。
// 渠道选择点击即生效（setAIEngine），Key/模型/代理仍需「保存」。
import { bridgeUrl } from './bridgeClient.ts';

const GEMINI_FALLBACK = { configured: false, apiKeyTail: '', model: 'gemini-2.5-flash', proxy: '' };

const AI_CHANNELS = [
  {
    key: 'agent',
    name: '本地 Agent 渠道',
    desc: '调用本机已安装并登录的命令行工具，无需 API Key',
    engines: [
      { engine: 'claude', name: 'Claude', desc: 'Claude Code CLI' },
      { engine: 'codex', name: 'Codex', desc: 'Codex CLI' }
    ]
  },
  {
    key: 'api',
    name: 'API Key 渠道',
    desc: '使用你自己的 API Key 直连服务商',
    engines: [
      { engine: 'gemini', name: 'Gemini', desc: 'Google Generative Language API' }
    ]
  }
];

export class AISettingsMethods {
  async openAISettings() {
    const overlay = this._buildAISettingsModal();
    // 先加载回填、再展示：异步回填会重置 Key 输入框，
    // 若先展示，粘贴得快的 Key 会被回填悄悄清掉。
    await this._loadAISettings();
    this._syncAISettingsEngine();
    overlay.style.display = 'flex';
  }


  closeAISettings() {
    if (this._aiSettingsEl) this._aiSettingsEl.style.display = 'none';
  }


  _aiSettingsField(labelText, input) {
    const field = document.createElement('label');
    field.className = 'ai-settings-field';
    const label = document.createElement('span');
    label.textContent = labelText;
    field.append(label, input);
    return field;
  }


  _buildAISettingsModal() {
    if (this._aiSettingsEl) return this._aiSettingsEl;
    const overlay = document.createElement('div');
    overlay.className = 'ai-settings-overlay';
    const modal = document.createElement('div');
    modal.className = 'ai-settings-modal';
    const title = document.createElement('strong');
    title.className = 'ai-settings-title';
    title.textContent = '设置';
    const overline = document.createElement('div');
    overline.className = 'ai-settings-overline';
    overline.textContent = 'AI 渠道';
    const hint = document.createElement('p');
    hint.className = 'ai-settings-hint';
    hint.textContent = '阅读问答使用所选渠道回答；渠道点击即生效。划词翻译固定走 Gemini。';

    const note = document.createElement('div');
    note.className = 'ai-settings-note';

    modal.append(title, overline, hint, this._buildAIChannelSection(), note, this._buildAISettingsActions());
    overlay.appendChild(modal);
    if (overlay.addEventListener) {
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.closeAISettings(); });
    }
    document.body.appendChild(overlay);
    this._aiSettingsEl = overlay;
    this._aiSettingsNote = note;
    return overlay;
  }


  // 渠道分组：本地 Agent（Claude/Codex）与 API Key（Gemini + 其配置表单）。
  _buildAIChannelSection() {
    const section = document.createElement('div');
    section.className = 'ai-channel-section';
    AI_CHANNELS.forEach((channel) => {
      const group = document.createElement('div');
      group.className = 'ai-channel-group';
      const head = document.createElement('div');
      head.className = 'ai-channel-head';
      const name = document.createElement('strong');
      name.textContent = channel.name;
      const desc = document.createElement('small');
      desc.className = 'ai-channel-desc';
      desc.textContent = channel.desc;
      head.append(name, desc);
      const options = document.createElement('div');
      options.className = 'ai-channel-options';
      options.setAttribute('role', 'radiogroup');
      options.setAttribute('aria-label', channel.name);
      channel.engines.forEach((item) => options.appendChild(this._aiChannelOption(item)));
      group.append(head, options);
      if (channel.key === 'api') group.appendChild(this._buildGeminiForm());
      section.appendChild(group);
    });
    return section;
  }


  _aiChannelOption(item) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'ai-channel-option';
    option.dataset.engine = item.engine;
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', 'false');
    const name = document.createElement('strong');
    name.textContent = item.name;
    const desc = document.createElement('small');
    desc.textContent = item.desc;
    option.append(name, desc);
    option.addEventListener('click', () => this.setAIEngine(item.engine));
    if (!this._aiChannelOptions) this._aiChannelOptions = [];
    this._aiChannelOptions.push(option);
    return option;
  }


  // 当前引擎的选中态；引擎切换（setAIEngine → _syncAIEngineSwitch）也会转发到这里。
  _syncAISettingsEngine() {
    (this._aiChannelOptions || []).forEach((option) => {
      const active = option.dataset.engine === this.aiEngine;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }


  _buildGeminiForm() {
    const form = document.createElement('div');
    form.className = 'ai-channel-provider-form';
    const key = document.createElement('input');
    key.type = 'password';
    key.spellcheck = false;
    const model = document.createElement('input');
    model.type = 'text';
    model.spellcheck = false;
    const proxy = document.createElement('input');
    proxy.type = 'text';
    proxy.spellcheck = false;
    proxy.placeholder = '如 http://127.0.0.1:7890，留空自动用系统代理变量';
    form.append(
      this._aiSettingsField('Gemini API Key', key),
      this._aiSettingsField('模型', model),
      this._aiSettingsField('代理地址（可选）', proxy)
    );
    this._aiSettingsInputs = { key, model, proxy };
    return form;
  }


  _buildAISettingsActions() {
    const actions = document.createElement('div');
    actions.className = 'ai-settings-actions';
    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'tbtn ai-settings-test';
    testBtn.textContent = '测试连接';
    testBtn.addEventListener('click', () => this._testAISettings());
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tbtn ai-settings-clear';
    clear.textContent = '清除 Key';
    clear.addEventListener('click', () => this._clearAIKey());
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'abtn secondary';
    close.textContent = '关闭';
    close.addEventListener('click', () => this.closeAISettings());
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'abtn primary';
    save.textContent = '保存';
    save.addEventListener('click', () => this._saveAISettings());
    actions.append(testBtn, clear, spacer, close, save);
    this._aiSettingsClearBtn = clear;
    return actions;
  }


  _setAISettingsNote(text, state) {
    const note = this._aiSettingsNote;
    if (!note) return;
    note.textContent = text;
    note.setAttribute('data-state', state || '');
  }


  // 用表单当前值验证连通性（Key 留空时服务端回落到已保存的），保存前即可测。
  async _testAISettings() {
    const inputs = this._aiSettingsInputs;
    if (!inputs) return;
    const payload = {
      gemini: {
        model: String(inputs.model.value || '').trim() || undefined,
        proxy: String(inputs.proxy.value || '').trim() || undefined
      }
    };
    const key = String(inputs.key.value || '').trim();
    if (key) payload.gemini.apiKey = key;
    this._setAISettingsNote('正在验证连接…', '');
    try {
      const response = await fetch(bridgeUrl('/api/settings/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('验证请求失败');
      const result = await response.json();
      if (result.ok) this._setAISettingsNote('✓ 连接成功 · ' + (result.model || ''), 'ok');
      else this._setAISettingsNote('✗ ' + (result.message || '验证失败'), 'error');
    } catch (error) {
      this._setAISettingsNote('✗ ' + (error.message || '验证失败'), 'error');
    }
  }


  async _loadAISettings() {
    try {
      const response = await fetch(bridgeUrl('/api/settings'));
      if (!response.ok) throw new Error('设置读取失败');
      this.aiProviderSettings = await response.json();
    } catch {
      this.aiProviderSettings = null;
    }
    this._syncAISettingsForm();
  }


  _syncAISettingsForm() {
    const inputs = this._aiSettingsInputs;
    if (!inputs) return;
    const gemini = (this.aiProviderSettings && this.aiProviderSettings.gemini) || GEMINI_FALLBACK;
    this._setAISettingsNote('', '');
    inputs.key.value = '';
    inputs.key.placeholder = gemini.configured
      ? '已配置（尾号 ' + gemini.apiKeyTail + '），留空保持不变'
      : '粘贴 Gemini API Key';
    inputs.model.value = gemini.model || GEMINI_FALLBACK.model;
    inputs.proxy.value = gemini.proxy || '';
    if (this._aiSettingsClearBtn) this._aiSettingsClearBtn.style.display = gemini.configured ? '' : 'none';
  }


  async _saveAISettings() {
    const inputs = this._aiSettingsInputs;
    if (!inputs) return;
    const payload = {
      gemini: {
        model: String(inputs.model.value || '').trim() || undefined,
        // 代理始终提交：空串 = 显式清除
        proxy: String(inputs.proxy.value || '').trim()
      }
    };
    const key = String(inputs.key.value || '').trim();
    if (key) payload.gemini.apiKey = key;
    try {
      const response = await fetch(bridgeUrl('/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('设置保存失败');
      this.aiProviderSettings = await response.json();
      this.closeAISettings();
      const configured = this.aiProviderSettings && this.aiProviderSettings.gemini
        && this.aiProviderSettings.gemini.configured;
      this._setStatus(configured ? 'AI 设置已保存 · Gemini 已配置' : 'AI 设置已保存');
    } catch (error) {
      this._setStatus(error.message || '设置保存失败');
    }
  }


  async _clearAIKey() {
    try {
      const response = await fetch(bridgeUrl('/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini: { apiKey: '' } })
      });
      if (!response.ok) throw new Error('清除失败');
      this.aiProviderSettings = await response.json();
      this._syncAISettingsForm();
      this._setStatus('已清除 Gemini API Key');
    } catch (error) {
      this._setStatus(error.message || 'Key 清除失败');
    }
  }
}
