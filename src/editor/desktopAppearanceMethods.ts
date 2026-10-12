// @ts-nocheck
import { t } from './i18n.ts';
import { userReadingFonts } from '../fonts/userReadingFont.ts';

export function resolveDarkPaperSoftening(saved) {
  if (typeof saved?.softenDarkPaper === 'boolean') return saved.softenDarkPaper;
  // Older explicit paper choices keep their original appearance until opted in.
  return !(saved?.paperDark || saved?.paper);
}

export class DesktopAppearanceMethods {
  _initDesktopAppearance(saved) {
    this.softenDarkPaper = resolveDarkPaperSoftening(saved);
    this._initReadingFont(saved);
  }

  _initDesktopSettings() {
    this._pcSettingsMenu = document.querySelector('.pc-global-menu');
    this._pcSettingsButton = document.querySelector('.pc-header-settings');
    this.togglePCSettingsMenu(false);
    this._pcSettingsClick = event => {
      const entry = event.target.closest('[data-pc-preference]');
      if (!entry) return;
      const section = entry.dataset.pcPreference;
      this.togglePCSettingsMenu(false);
      this._pcSettingsButton.focus({ preventScroll: true });
      this.openWorkspaceSettings(section === 'language' ? 'general' : ['font','paper'].includes(section) ? 'reading' : section);
      const panel = this.appearancePanelRef.current;
      panel.dataset.pcSettings = section;
      this._syncDesktopAppearance();
      const selector = {font:'.reading-font-select', paper:'.appearance-theme', language:'.interface-language-option[aria-checked="true"]'}[section];
      panel.querySelector(selector || '.appearance-close')?.focus({preventScroll:true});
    };
    this._pcSettingsMenu?.addEventListener('click', this._pcSettingsClick);
    this._pcSettingsResize = () => {
      if (window.matchMedia('(max-width:760px)').matches && this._pcSettingsOpen) {
        this.togglePCSettingsMenu(false);
        document.querySelector('.mobile-menu-toggle')?.focus({preventScroll:true});
      }
    };
    window.addEventListener('resize', this._pcSettingsResize);
    this._syncDesktopAppearance();
  }

  togglePCSettingsMenu(force, returnFocus = false) {
    if (!this._pcSettingsMenu) return;
    const next = typeof force === 'boolean' ? force : !this._pcSettingsOpen;
    this._pcSettingsOpen = next;
    this._pcSettingsMenu.hidden = !next;
    this._pcSettingsButton.setAttribute('aria-expanded', String(next));
    if (next) {
      this.toggleQuickAppearance(false);
      this.toggleExportMenu(false);
      this.toggleFileMenu(false);
      this._pcSettingsMenu.querySelector('button')?.focus({preventScroll:true});
    } else if (returnFocus) this._pcSettingsButton.focus({preventScroll:true});
  }

  _handleDesktopSettingsKey(event) {
    if (document.activeElement === this._pcSettingsButton && ['ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault();this.togglePCSettingsMenu(true);return true;
    }
    if (!this._pcSettingsOpen) return false;
    if (event.key === 'Escape') {
      event.preventDefault();this.togglePCSettingsMenu(false,true);return true;
    }
    if (event.key === 'Tab') { this.togglePCSettingsMenu(false); return false; }
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return false;
    const buttons = [...this._pcSettingsMenu.querySelectorAll('button')];
    let index = buttons.indexOf(document.activeElement);
    index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[index]?.focus(); return true;
  }

  _desktopSettingsOutside(event) {
    if (this._pcSettingsOpen && !this._pcSettingsMenu.contains(event.target) && !this._pcSettingsButton.contains(event.target)) {
      this.togglePCSettingsMenu(false);
    }
  }

  toggleDarkPaperSoftening() {
    this.softenDarkPaper = !this.softenDarkPaper;
    this._syncDesktopAppearance();
    this._persist(false);
  }

  _guardDesktopSettings() {
    if (window.matchMedia('(max-width:760px)').matches || this._pcSettingsInert) return;
    this._pcSettingsInert = [...this._settingsBackdrop.parentElement.children]
      .filter(node => node !== this._settingsBackdrop).map(node => [node, node.inert]);
    this._pcSettingsInert.forEach(([node]) => { node.inert = true; });
  }

  _restoreDesktopSettings() {
    this._pcSettingsInert?.forEach(([node, inert]) => { node.inert = inert; });
    this._pcSettingsInert = null;
  }

  _syncDesktopAppearance() {
    if (typeof document === 'undefined') return;
    document.body.setAttribute('data-soften-paper', String(this.softenDarkPaper === true));
    const checkbox = document.querySelector('.pc-soften-input');
    if (checkbox) checkbox.checked = this.softenDarkPaper === true;
    const panel = this.appearancePanelRef?.current;
    const title = panel?.querySelector('.pc-settings-title');
    const key = {font:'字体与阅读',paper:'主题与纸张',language:'界面语言'}[panel?.dataset.pcSettings] || '全局设置';
    if (title) title.textContent = t(key);
    const sample = document.querySelector('.pc-paper-description');
    if (sample) sample.textContent = t(this.theme === 'dark' && this.softenDarkPaper
      ? '已柔化桌面阅读纸张；关闭后恢复原纸色。' : '当前使用原纸色；主题与纸色分别记忆。');
    this._syncDesktopFontStatus();
  }

  _syncDesktopFontStatus() {
    const node = document.querySelector('.pc-font-status');
    if (!node) return;
    const fonts = userReadingFonts();
    let key = '使用设备可用字体；文稿内容不变。';
    if (this.readingFont === 'local-jinkai') key = this._readingFontStatus === 'available' ? '本机字体可用'
      : this._readingFontStatus === 'unavailable' ? '未检测到可用的本机字体，已使用系统后备字体。' : '无法检测本机字体，已保留系统后备字体。';
    if (this.readingFont === 'source-serif-4') key = 'Source Serif 4 内置拉丁字体；中文与日文使用设备可用字体后备。';
    if (['imported-font','project-jinkai'].includes(this.readingFont)) {
      const kind = this.readingFont === 'imported-font' ? 'imported' : 'project';
      key = fonts[kind].status === 'available' ? '所选字体已加载，仅在当前设备使用。' : '所选字体不可用，已使用系统后备；原选择保留。';
    }
    node.textContent = t(key);
    node.dataset.state = this.readingFont === 'local-jinkai' ? this._readingFontStatus || 'unknown' : 'info';
  }

  _disposeDesktopSettings() {
    this._pcSettingsMenu?.removeEventListener('click', this._pcSettingsClick);
    window.removeEventListener('resize', this._pcSettingsResize);
  }
}
