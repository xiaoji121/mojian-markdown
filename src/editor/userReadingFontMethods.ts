// @ts-nocheck
import { t } from './i18n.ts';
import { loadUserReadingFonts, onUserReadingFonts, userReadingFonts, prepareReadingFont, activateReadingFont, clearReadingFont } from '../fonts/userReadingFont.ts';

export class UserReadingFontMethods {
  _initUserReadingFonts() {
    this._fontChoiceVersion = 0;
    this._fontImportButton = document.querySelector('.reading-font-import');
    this._fontRemoveButton = document.querySelector('.reading-font-remove');
    this._fontImportClick = () => this._importReadingFont();
    this._fontRemoveClick = () => this._removeImportedReadingFont();
    this._fontImportButton?.addEventListener('click', this._fontImportClick);
    this._fontRemoveButton?.addEventListener('click', this._fontRemoveClick);
    this._stopFontUpdates = onUserReadingFonts(() => this._renderUserReadingFonts());
    this._renderUserReadingFonts();
    void loadUserReadingFonts(window.mojianDesktop?.readingFont);
  }
  _renderUserReadingFonts() {
    const fonts = userReadingFonts();
    const api = window.mojianDesktop?.readingFont;
    const project = document.querySelector('.reading-font-project-status');
    const imported = document.querySelector('.reading-font-import-status');
    if (project) project.textContent = t(fonts.project.status === 'available'
      ? '已加载项目字体 cejk-subset.woff2；这不是系统安装的 W04 字体。'
      : '项目字体不可用；仅源码桌面版读取已有的 font:fetch 文件。');
    if (imported) imported.textContent = this._fontActionKey ? t(this._fontActionKey)
      : fonts.imported.status === 'available' ? t('已导入：{name}（{format}，{size} KB，仅此应用）', { name: fonts.imported.fileName || 'font', format: fonts.imported.format?.toUpperCase() || 'FONT', size: Math.ceil((fonts.imported.byteLength || 0) / 1024) })
      : t(api ? '未载入导入字体；当前使用所选字体或系统后备。' : '导入字体需要桌面应用。');
    const projectNote = document.querySelector('.reading-font-project-note');
    if (projectNote) projectNote.hidden = this.readingFont !== 'project-jinkai';
    for (const [id, kind] of [['project-jinkai', 'project'], ['imported-font', 'imported']]) {
      const option = this._readingFontSelect?.querySelector(`option[value="${id}"]`);
      if (option) option.disabled = fonts[kind].status !== 'available';
    }
    if (this._fontImportButton) this._fontImportButton.disabled = !api || !!this._fontActionBusy;
    if (this._fontRemoveButton) this._fontRemoveButton.disabled = !api || !!this._fontActionBusy || fonts.imported.status === 'unavailable';
  }
  async _importReadingFont() {
    const api = window.mojianDesktop?.readingFont;
    if (!api || this._fontActionBusy) return;
    this._fontActionBusy = true;
    this._fontActionKey = '正在读取字体…';
    const choiceVersion = this._fontChoiceVersion;
    let committed = false;
    this._renderUserReadingFonts();
    try {
      const candidate = await api('choose');
      if (candidate.status === 'cancelled') { this._fontActionKey = ''; return; }
      if (candidate.status !== 'candidate') throw new Error('invalid-font');
      await prepareReadingFont('imported', candidate);
      if (this._userFontsDisposed) { await api('cancel'); return; }
      const result = await api('commit', { token: candidate.token });
      if (result.status !== 'available') throw new Error('write-failed');
      committed = true;
      await activateReadingFont('imported', result);
      this._fontActionKey = '';
      if (!this._userFontsDisposed && choiceVersion === this._fontChoiceVersion) {
        this.readingFont = 'imported-font'; this._applyReadingFont(); this._persist(false);
      }
    } catch {
      await api('cancel').catch(() => {});
      this._fontActionKey = committed ? '字体已保存，但当前无法显示；系统后备字体可用。'
        : '字体未能导入；支持 WOFF、WOFF2、TTF、OTF，最大 32 MB。原有字体保留。';
    } finally { this._fontActionBusy = false; if (!this._userFontsDisposed) this._renderUserReadingFonts(); }
  }
  async _removeImportedReadingFont() {
    const api = window.mojianDesktop?.readingFont;
    if (!api || this._fontActionBusy) return;
    this._fontActionBusy = true; this._renderUserReadingFonts();
    try {
      const result = await api('remove');
      if (result.status !== 'unavailable') throw new Error('write-failed');
      clearReadingFont('imported');
      this._fontActionKey = '已移除应用中的字体副本，原文件不变。';
    } catch { this._fontActionKey = '无法移除字体副本，请重试。'; }
    finally { this._fontActionBusy = false; this._renderUserReadingFonts(); }
  }
  _disposeUserReadingFonts() {
    this._userFontsDisposed = true;
    this._stopFontUpdates?.();
    this._fontImportButton?.removeEventListener('click', this._fontImportClick);
    this._fontRemoveButton?.removeEventListener('click', this._fontRemoveClick);
  }
}
