// @ts-nocheck
import { detectLocalReadingFont, READING_FONT_OFFICIAL_URL } from '../fonts/localReadingFont.ts';
import { detectLocale, getLocale, isLocale, setLocale, t } from './i18n.ts';

import { localeFromPath } from '../landing/route.ts';
import { translateChrome } from './localeChrome.ts';

export class LocaleMethods {
  _initLocale(saved) {
    const landingLocale = window.mojianDesktop ? document.documentElement.dataset.desktopLandingLocale : localeFromPath(window.location.pathname);
    setLocale(isLocale(saved?.locale) ? saved.locale : isLocale(landingLocale) ? landingLocale : detectLocale(navigator.language));
    if (window.location.hash === '#editor') {
      document.documentElement.lang = getLocale();
      document.title = getLocale() === 'en' ? 'Mojian Markdown' : '墨笺 Markdown';
    }
    this._localeSelect = document.querySelector('.interface-language');
    if (this._localeSelect) {
      this._localeSelect.value = getLocale();
      this._localeChange = () => this._changeLocale(this._localeSelect.value);
      this._localeSelect.addEventListener('change', this._localeChange);
    }
    translateChrome(document);
    this._readingFontStatus = 'unknown';
    const link = document.querySelector('.reading-font-link');
    if (link) link.href = READING_FONT_OFFICIAL_URL;
    void detectLocalReadingFont().then(status => {
      this._readingFontStatus = status;
      this._renderReadingFontStatus();
    });
  }

  _changeLocale(value) {
    if (!isLocale(value) || value === getLocale()) return;
    setLocale(value);
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

  _disposeLocale() { this._localeSelect?.removeEventListener('change', this._localeChange); }
}
