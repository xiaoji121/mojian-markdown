// @ts-nocheck
// Desktop settings use narrow validated IPC; the plaintext CLI mode remains
// separate and is explicitly disclosed. Password inputs are never restored.
import { bridgeUrl } from './bridgeClient.ts';

const GEMINI_FALLBACK = { configured: false, model: 'gemini-2.5-flash', proxy: '' };

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
    if (this._aiSettingsEl?.style.display === 'flex') return;
    this._aiSettingsReturnFocus = document.activeElement;
    const epoch = this._aiSettingsEpoch = (this._aiSettingsEpoch || 0) + 1;
    const overlay = this._buildAISettingsModal();
    // 先加载回填、再展示：异步回填会重置 Key 输入框，
    // 若先展示，粘贴得快的 Key 会被回填悄悄清掉。
    await this._loadAISettings(epoch);
    if (epoch !== this._aiSettingsEpoch) return;
    this._syncAISettingsEngine();
    overlay.style.display = 'flex';
    this._aiChannelOptions?.find((option) => option.dataset.engine === this.aiEngine)?.focus?.();
    if (!overlay.contains?.(document.activeElement)) this._aiSettingsDialog?.focus?.();
  }


  closeAISettings() {
    this._aiSettingsEpoch = (this._aiSettingsEpoch || 0) + 1;
    if (this._aiSettingsInputs) this._aiSettingsInputs.key.value = '';
    if (this._aiSettingsEl) this._aiSettingsEl.style.display = 'none';
    const previous = this._aiSettingsReturnFocus;
    const target = previous?.isConnected && previous.getClientRects?.().length
      ? previous : this.fileMenuButtonRef?.current;
    target?.focus?.();
    if (this.aiPanelOpen) this._refreshAIReadiness?.();
    this._resumeAISetup?.();
  }


  async _requestAISettings(operation, payload) {
    const desktop = typeof window !== 'undefined' && window.mojianDesktop;
    if (desktop?.aiSettings) {
      const result = await desktop.aiSettings(operation, payload);
      if (!result.ok) throw new Error(result.error || '设置操作失败');
      return result.value;
    }
    const path = operation === 'test' ? '/api/settings/test' : '/api/settings';
    const response = await fetch(bridgeUrl(path), operation === 'load' ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('设置操作失败');
    const value = await response.json();
    return operation === 'test' ? value : { providers: value, secureStorage: null };
  }

  _acceptAISettings(result) {
    this.aiProviderSettings = result.providers;
    this._aiSecureStorage = result.secureStorage;
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
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'AI 设置');
    modal.setAttribute('tabindex', '-1');
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
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    const disclosure = document.createElement('p');
    disclosure.className = 'ai-settings-disclosure ai-settings-hint';
    disclosure.textContent = '“测试 Gemini 连接”只验证 Gemini，不验证所选的 Claude / Codex。仅点击测试才会将 Key 发送给 Google，可能产生 API 使用费用；使用已保存的代理（留空时使用系统代理变量）。修改代理后请先保存。测试最长等待 15 秒；打开设置和保存不会联网。';

    modal.append(title, overline, hint, this._buildAIChannelSection(), disclosure, note, this._buildAISettingsActions());
    overlay.appendChild(modal);
    if (overlay.addEventListener) {
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.closeAISettings(); });
      overlay.addEventListener('keydown', (e) => this._handleAISettingsKey(e));
    }
    document.body.appendChild(overlay);
    this._aiSettingsEl = overlay;
    this._aiSettingsNote = note;
    this._aiSettingsDialog = modal;
    return overlay;
  }

  _handleAISettingsKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeAISettings();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...this._aiSettingsDialog.querySelectorAll('button, input, [tabindex="0"]')]
      .filter((element) => !element.disabled && element.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    const active = document.activeElement;
    if (!first) { event.preventDefault(); this._aiSettingsDialog.focus(); }
    else if (event.shiftKey && (active === first || !controls.includes(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !controls.includes(active))) {
      event.preventDefault(); first.focus();
    }
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
    key.autocomplete = 'off';
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
    Object.values(this._aiSettingsInputs).forEach((input) => {
      input.addEventListener('input', () => this._invalidateAISettingsTest());
    });
    return form;
  }


  _buildAISettingsActions() {
    const actions = document.createElement('div');
    actions.className = 'ai-settings-actions';
    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'tbtn ai-settings-test';
    testBtn.textContent = '测试 Gemini 连接';
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
    const migrate = document.createElement('button');
    migrate.type = 'button';
    migrate.className = 'tbtn ai-settings-migrate';
    migrate.textContent = '同意迁移旧明文 Key';
    migrate.style.display = 'none';
    migrate.addEventListener('click', () => this._migrateAIKey());
    actions.append(testBtn, clear, migrate, spacer, close, save);
    this._aiSettingsMigrateBtn = migrate;
    this._aiSettingsActionBtns = [testBtn, clear, migrate, save];
    this._aiSettingsClearBtn = clear;
    this._aiSettingsCloseBtn = close;
    return actions;
  }


  _setAISettingsBusy(value) {
    this._aiSettingsBusy = value;
    // Disabling Chromium's focused button sends focus to body, outside this
    // dialog's Escape/Tab handlers. Move it to the enabled Close button first.
    if (value && this._aiSettingsActionBtns?.includes(document.activeElement)) {
      (this._aiSettingsCloseBtn || this._aiSettingsDialog)?.focus?.();
    }
    (this._aiSettingsActionBtns || []).forEach((button) => { button.disabled = value; });
  }

  _setAISettingsNote(text, state) {
    const note = this._aiSettingsNote;
    if (!note) return;
    note.textContent = text;
    note.setAttribute('data-state', state || '');
  }

  _invalidateAISettingsTest() {
    this._aiSettingsFormRevision = (this._aiSettingsFormRevision || 0) + 1;
    if (this._aiSettingsTestStarted) this._setAISettingsNote('Gemini 配置已更改，请重新测试。', '');
  }

  // Test the typed key/model, but use the saved proxy. Never test on open/save.
  async _testAISettings() {
    if (this._aiSettingsBusy) return;
    const epoch = this._aiSettingsEpoch;
    const inputs = this._aiSettingsInputs;
    if (!inputs) return;
    const revision = this._aiSettingsFormRevision || 0;
    this._aiSettingsTestStarted = true;
    const payload = {
      gemini: {
        model: String(inputs.model.value || '').trim()
      }
    };
    const key = String(inputs.key.value || '').trim();
    if (key) payload.gemini.apiKey = key;
    this._setAISettingsBusy(true);
    this._setAISettingsNote('正在验证 Gemini 连接…', '');
    try {
      const result = await this._requestAISettings('test', payload);
      if (epoch !== this._aiSettingsEpoch || revision !== (this._aiSettingsFormRevision || 0)) return;
      if (result.ok) this._setAISettingsNote('✓ Gemini 连接成功' + (result.model ? ' · ' + result.model : ''), 'ok');
      else this._setAISettingsNote('✗ ' + (result.message || '验证失败'), 'error');
    } catch (error) {
      if (epoch === this._aiSettingsEpoch && revision === (this._aiSettingsFormRevision || 0)) {
        this._setAISettingsNote('✗ ' + (error.message || '验证失败'), 'error');
      }
    } finally { this._setAISettingsBusy(false); }
  }


  async _loadAISettings(epoch) {
    try {
      const result = await this._requestAISettings('load');
      if (epoch !== undefined && epoch !== this._aiSettingsEpoch) return;
      this._acceptAISettings(result);
      this._aiSettingsLoadError = false;
    } catch {
      if (epoch !== undefined && epoch !== this._aiSettingsEpoch) return;
      this.aiProviderSettings = null;
      this._aiSettingsLoadError = true;
    }
    this._syncAISettingsForm();
  }


  _syncAISettingsForm() {
    const inputs = this._aiSettingsInputs;
    if (!inputs) return;
    this._aiSettingsTestStarted = false;
    this._aiSettingsFormRevision = (this._aiSettingsFormRevision || 0) + 1;
    const gemini = (this.aiProviderSettings && this.aiProviderSettings.gemini) || GEMINI_FALLBACK;
    const secure = this._aiSecureStorage;
    const legacy = gemini.credentialStatus === 'migration-required';
    const disclosure = this._aiSettingsLoadError ? '设置读取失败；未覆盖原有文件。'
      : legacy ? '发现旧明文 Key。点击“同意迁移”才会用系统安全存储加密并替换原文件；不会联网，也不会保留明文备份。'
      : secure ? (secure.available
        ? '保存会使用本机系统安全存储加密 Key；保存不联网。'
        : ({ unsupported: '此平台暂不支持密钥安全存储。', locked: '系统安全存储已锁定或拒绝访问。', unavailable: '系统安全存储暂不可用。' }[secure.status]
          || '系统安全存储暂不可用。') + '不会回退为明文；普通编辑不受影响。')
        : '命令行网页版将 Key 以明文保存在本机 settings.json；保存不联网。';
    this._setAISettingsNote(disclosure, this._aiSettingsLoadError ? 'error' : '');
    if (this._aiSettingsMigrateBtn) this._aiSettingsMigrateBtn.style.display = legacy ? '' : 'none';
    inputs.key.value = '';
    inputs.key.placeholder = gemini.configured
      ? '已配置，留空保持不变'
      : '粘贴 Gemini API Key';
    inputs.model.value = gemini.model || GEMINI_FALLBACK.model;
    inputs.proxy.value = gemini.proxy || '';
    if (this._aiSettingsClearBtn) this._aiSettingsClearBtn.style.display = (gemini.configured || legacy) ? '' : 'none';
  }


  async _saveAISettings() {
    if (this._aiSettingsBusy) return;
    const epoch = this._aiSettingsEpoch;
    const inputs = this._aiSettingsInputs;
    if (!inputs) return;
    const payload = {
      gemini: {
        model: String(inputs.model.value || '').trim(),
        // 代理始终提交：空串 = 显式清除
        proxy: String(inputs.proxy.value || '').trim()
      }
    };
    const key = String(inputs.key.value || '').trim();
    if (key) payload.gemini.apiKey = key;
    try {
      this._setAISettingsBusy(true);
      inputs.key.value = '';
      const result = await this._requestAISettings('save', payload);
      if (this.aiReadiness && !this.aiPanelOpen) this._refreshAIReadiness?.();
      else if (epoch !== this._aiSettingsEpoch && this.aiPanelOpen) this._refreshAIReadiness?.();
      if (epoch !== this._aiSettingsEpoch) return;
      this._acceptAISettings(result);
      this.closeAISettings();
      const configured = this.aiProviderSettings && this.aiProviderSettings.gemini
        && this.aiProviderSettings.gemini.configured;
      this._setStatus(configured ? 'AI 设置已保存 · Gemini 已配置' : 'AI 设置已保存');
    } catch (error) {
      if (epoch === this._aiSettingsEpoch) this._setStatus(error.message || '设置保存失败');
    } finally { this._setAISettingsBusy(false); }
  }


  async _migrateAIKey() {
    if (this._aiSettingsBusy) return;
    const epoch = this._aiSettingsEpoch;
    this._setAISettingsBusy(true);
    try {
      const result = await this._requestAISettings('migrate', { consent: true });
      if (this.aiReadiness || this.aiPanelOpen) this._refreshAIReadiness?.();
      if (epoch !== this._aiSettingsEpoch) return;
      this._acceptAISettings(result);
      this._syncAISettingsForm();
      this._setStatus('旧 Key 已迁移为本机加密存储');
    } catch (error) { if (epoch === this._aiSettingsEpoch) this._setStatus(error.message || '迁移失败，原文件已保留'); }
    finally { this._setAISettingsBusy(false); }
  }

  async _clearAIKey() {
    if (this._aiSettingsBusy) return;
    const epoch = this._aiSettingsEpoch;
    this._setAISettingsBusy(true);
    if (this._aiSettingsInputs) this._aiSettingsInputs.key.value = '';
    try {
      const result = await this._requestAISettings('save', { gemini: { apiKey: '' } });
      if (this.aiReadiness || this.aiPanelOpen) this._refreshAIReadiness?.();
      if (epoch !== this._aiSettingsEpoch) return;
      this._acceptAISettings(result);
      this._syncAISettingsForm();
      this._setStatus('已清除 Gemini API Key');
    } catch (error) {
      if (epoch === this._aiSettingsEpoch) this._setStatus(error.message || 'Key 清除失败');
    } finally { this._setAISettingsBusy(false); }
  }
}
