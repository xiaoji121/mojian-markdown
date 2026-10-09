// @ts-nocheck
import { detectLocalReadingFont, READING_FONT_OFFICIAL_URL } from '../fonts/localReadingFont.ts';
import { detectLocale, getLocale, isLocale, setLocale, t } from './i18n.ts';

import { localeFromPath } from '../landing/route.ts';
import { bindLocaleSettings, syncLocaleSettings } from './localeSettings.ts';
import { translateChrome } from './localeChrome.ts';

export class LocaleMethods {
  _initLocale(saved) {
    const landingLocale = window.mojianDesktop ? document.documentElement.dataset.desktopLandingLocale : localeFromPath(window.location.pathname);
    setLocale(isLocale(saved?.locale) ? saved.locale : isLocale(landingLocale) ? landingLocale : detectLocale(navigator.language));
    if (window.location.hash === '#editor') {
      document.documentElement.lang = getLocale();
      document.title = getLocale() === 'en' ? 'Mojian Markdown' : '墨笺 Markdown';
    }
    document.documentElement.dataset.editorLocale = getLocale();
    syncLocaleSettings(document, getLocale());
    this._disposeLocaleSettings = bindLocaleSettings(document, value => this._changeLocale(value));
    this._initLanguagePanel();
    translateChrome(document);
    this._readingFontStatus = 'unknown';
    const link = document.querySelector('.reading-font-link');
    if (link) link.href = READING_FONT_OFFICIAL_URL;
    void detectLocalReadingFont().then(status => {
      this._readingFontStatus = status;
      this._renderReadingFontStatus();
    });
  }

  _initLanguagePanel() {
    this._languagePanel = document.querySelector('.interface-language-panel');
    if (this._languagePanel) this._languagePanel.hidden = true;
    this._languageOutsideH = event => {
      if (!this.languageOpen || this._languagePanel?.contains(event.target)
        || this.fileMenuButtonRef.current?.contains(event.target)) return;
      this.toggleInterfaceLanguage(false);
    };
    this._languageKeyH = event => {
      if (!this.languageOpen || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.toggleInterfaceLanguage(false, true);
    };
    document.addEventListener('pointerdown', this._languageOutsideH);
    document.addEventListener('focusin', this._languageOutsideH);
    document.addEventListener('keydown', this._languageKeyH);
  }

  toggleInterfaceLanguage(force, returnFocus = false) {
    const panel = this._languagePanel;
    if (!panel) return;
    this.languageOpen = typeof force === 'boolean' ? force : !this.languageOpen;
    panel.hidden = !this.languageOpen;
    if (this.languageOpen) {
      if (this.appearanceOpen) this.toggleReadingAppearance(false);
      (panel.querySelector('[aria-checked="true"]') || panel).focus({ preventScroll: true });
    } else if (returnFocus) this.fileMenuButtonRef.current?.focus({ preventScroll: true });
  }

  _changeLocale(value) {
    if (!isLocale(value) || value === getLocale()) return;
    setLocale(value);
    document.documentElement.dataset.editorLocale = getLocale();
    syncLocaleSettings(document, getLocale());
    if (window.location.hash === '#editor') {
      document.documentElement.lang = getLocale();
      document.title = getLocale() === 'en' ? 'Mojian Markdown' : '墨笺 Markdown';
    }
    translateChrome(document);
    this._applyTheme();
    this._buildPaperPicker();
    this._syncImmersiveWideButton();
    this._syncPreviewEditable();
    this._updateCount();
    this._renderOutline();
    this._renderReadingFontStatus();
    this._renderUserReadingFonts?.();
    this._renderRecentDocuments();
    this._renderComments();
    this._renderAIReadiness?.();
    if (this._aiStatusLocale && this.aiStatusRef.current) this.aiStatusRef.current.textContent = this._aiStatusLocale();
    this._syncAIEngineSwitch?.();
    this._renderAIQuote?.();
    this._renderAIHistory?.();
    this._renderAIMessages?.();
    this._setAIBusy?.(this.aiBusy);
    this._refreshAISettingsLocale?.();
    this._syncFileNameTooltip?.();
    this._syncSearchCount?.();
    this._syncPreviewSearchCount?.(this.previewSearchInputRef?.current?.value || '');
    this._syncLongImageControls?.();
    this._syncReadingPathBar?.();
    if (this.fullscreenLabelRef.current) this.fullscreenLabelRef.current.textContent = t(this.previewFullscreen ? '退出专注' : '专注');
    const saved = this._persist(false);
    this._setStatus(t(saved === false ? '草稿保存失败 · 请保存到文件' : '语言已切换'));
  }

  _renderReadingFontStatus() {
    const node = document.querySelector('.reading-font-status');
    if (!node) return;
    const key = this._readingFontStatus === 'available' ? '本机字体可用'
      : this._readingFontStatus === 'unavailable' ? '未检测到可用的本机字体，已使用系统后备字体。'
      : '无法检测本机字体，已保留系统后备字体。';
    node.textContent = t(key);
  }

  _disposeLocale() {
    this._disposeReadingFont?.();
    this._disposeLocaleSettings?.();
    document.removeEventListener('pointerdown', this._languageOutsideH);
    document.removeEventListener('focusin', this._languageOutsideH);
    document.removeEventListener('keydown', this._languageKeyH);
  }
}
