// @ts-nocheck
import { getLocale, t } from './i18n.ts';

// Mobile navigation presents the existing preference controls; their owners persist values.
export class MobileSettingsMethods {
  _initMobileSettings() {
    const panel = this.appearancePanelRef.current;
    const text = key => `<span data-i18n="${key}">${t(key)}</span>`;
    const row = (page, key, value = '') => `<button type="button" data-mobile-setting="${page}">${text(key)}<span class="mobile-settings-row-value ${value}"></span><span aria-hidden="true">›</span></button>`;
    const home = document.createElement('section');
    home.className = 'mobile-settings-home mobile-only';
    home.innerHTML = `<p class="appearance-note">${text('设置即时生效 · 完成仅关闭面板')}</p><p class="mobile-settings-group">${text('阅读排版')}</p>${row('font', '正文字体', 'mobile-settings-font-value')}${row('paper', '字号与纸张', 'mobile-settings-paper-value')}<p class="appearance-note">${text('阅读宽度随屏幕适配')}</p><p class="mobile-settings-group">${text('界面')}</p>${row('theme', '界面主题', 'mobile-settings-theme-value')}${row('language', '界面语言', 'mobile-settings-language-value')}${row('info', '桌面连接与功能说明')}<a class="settings-home-link abtn" href="#">${text('返回首页')}</a>`;
    home.querySelector('a').addEventListener('click', () => {
      this.toggleReadingAppearance(false);
      if (this.previewFullscreen) this.togglePreviewFullscreen(false);
    });
    panel.querySelector('.workspace-settings-content').prepend(home);
    const info = document.createElement('section');
    info.className = 'mobile-settings-info mobile-only';
    info.innerHTML = `<p class="appearance-note">${text('阅读、编辑、批注和导出可继续使用。')}</p><p class="appearance-note mobile-settings-capability"></p><p>${text('手机界面不提供 AI、翻译和集成设置。')}</p><p class="appearance-note">${text('字体导入与移除仅在桌面版提供。')}</p><p class="appearance-note">${text('ZIP 包含源文与已保存批注，暂不支持直接导入恢复。下载后请确认文件已保存。')}</p>`;
    home.after(info);
    const heading = document.createElement('span');
    heading.className = 'mobile-settings-heading mobile-only';
    panel.querySelector('.appearance-heading').after(heading);
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'mobile-settings-back mobile-only';
    back.innerHTML = text('返回设置');
    back.addEventListener('click', () => {
      const page = panel.dataset.mobileSettings;
      this._showMobileSettings('home');
      home.querySelector(`[data-mobile-setting="${page}"]`)?.focus({preventScroll:true});
    });
    panel.querySelector('.appearance-panel-header').prepend(back);
    const done = document.createElement('button');
    done.type = 'button'; done.className = 'mobile-settings-done mobile-only'; done.innerHTML = text('完成');
    done.addEventListener('click', () => this.toggleReadingAppearance(false, true));
    panel.append(done);
    home.querySelectorAll('[data-mobile-setting]').forEach(button => button.addEventListener('click', () => this._showMobileSettings(button.dataset.mobileSetting, true)));
    const reading = panel.querySelector('#settings-reading');
    const note = document.createElement('p');
    note.className = 'appearance-note mobile-settings-font-note mobile-only';
    note.innerHTML = text('Source Serif 4 内置拉丁字体；中文与日文使用设备可用字体后备。') + text('字体导入与移除仅在桌面版提供。');
    reading.append(note);
    [...reading.children].forEach(node => {
      node.dataset.mobilePreference = node.matches('.appearance-interface-theme') ? 'theme'
        : node.matches('.reading-font-field,.reading-font-preview,.reading-font-management,.mobile-settings-font-note') ? 'font'
        : node.matches('.appearance-row:not(.appearance-width)') ? 'paper' : 'note';
    });
  }

  _showMobileSettings(page = 'home', focus = false) {
    if (!this._mobileMedia?.matches) return;
    const panel = this.appearancePanelRef.current;
    if (!panel.querySelector('.mobile-settings-home')) return;
    panel.dataset.mobileSettings = page;
    if (page === 'font') {
      const details = panel.querySelector('.reading-font-management');
      if (this._mobileFontDetailsOpen === undefined) this._mobileFontDetailsOpen = details.open;
      details.open = true;
    }
    panel.querySelectorAll('[data-settings-page]').forEach(section => {
      section.hidden = section.dataset.settingsPage !== (page === 'language' ? 'general' : ['font','paper','theme'].includes(page) ? 'reading' : 'none');
    });
    const names = {home:'全局设置', font:'正文字体', paper:'字号与纸张', theme:'界面主题', language:'界面语言', info:'桌面连接与功能说明'};
    const heading = panel.querySelector('.mobile-settings-heading');
    heading.dataset.i18n = names[page]; heading.textContent = t(names[page]);
    panel.querySelector('.workspace-settings-content').scrollTop = 0;
    this._syncMobileSettings();
    if (focus) {
      const selector = {font:'.reading-font-select', paper:'.font-dec', theme:'.appearance-theme', language:'.interface-language-option[aria-checked="true"]', info:'.mobile-settings-back'};
      panel.querySelector(selector[page])?.focus({preventScroll:true});
    }
  }

  _restoreMobileSettings() {
    if (this._mobileFontDetailsOpen !== undefined) {
      this.appearancePanelRef.current.querySelector('.reading-font-management').open = this._mobileFontDetailsOpen;
      this._mobileFontDetailsOpen = undefined;
    }
    this._mobileSettingsInert?.forEach(([node, inert]) => { node.inert = inert; });
    this._mobileSettingsInert = null;
  }

  _guardMobileSettings() {
    if (!this._mobileMedia?.matches || this._mobileSettingsInert) return;
    this._mobileSettingsInert = [...this._settingsBackdrop.parentElement.children]
      .filter(node => node !== this._settingsBackdrop).map(node => [node, node.inert]);
    this._mobileSettingsInert.forEach(([node]) => { node.inert = true; });
  }

  _syncMobileSettings() {
    const panel = this.appearancePanelRef?.current;
    if (!panel?.querySelector('.mobile-settings-home')) return;
    panel.querySelector('.mobile-settings-font-value').textContent = this._readingFontSelect?.selectedOptions[0]?.textContent || '';
    panel.querySelector('.mobile-settings-paper-value').textContent = `${this.fontSize} px · ${this.PAPERS().find(p => p.id === this._resolvedPaper())?.label || ''}`;
    panel.querySelector('.mobile-settings-theme-value').textContent = t(this.theme === 'dark' ? '暗色' : '亮色');
    panel.querySelector('.mobile-settings-language-value').textContent = { 'zh-CN':'简体中文', 'zh-TW':'繁體中文', en:'English', ja:'日本語' }[getLocale()];
    panel.querySelector('.mobile-settings-capability').textContent = t(this._canWriteToDisk() ? '当前环境支持保存到文件；请在导出菜单中使用。' : '当前为浏览器草稿；导入不会写回手机原文件，请下载备份。');
  }
}
