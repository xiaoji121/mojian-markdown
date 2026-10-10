// @ts-nocheck
import { t } from './i18n.ts';
// 保存与导出共用一个菜单；新建、打开和全局设置各有固定入口。
export class WorkspaceMenuMethods {
  _workspaceMenuRenderVals() {
    const run = (action) => () => { this.toggleFileMenu(false); action(); };
    return {
      toggleFileMenu: () => this.toggleFileMenu(),
      toggleExportMenu: () => this.toggleExportMenu(),
      exportWithComments: run(() => this.copyFull()),
      downloadSourceMarkdown: run(() => this.downloadSourceMarkdown()),
      downloadAnnotationsMarkdown: run(() => this.downloadAnnotationsMarkdown()),
      downloadFullBackup: run(() => { void this.downloadFullBackup(); }),
      menuFileNew: run(() => this.onNew()),
      menuFileOpen: run(() => this.onOpen()),
      menuOpenAbsolutePath: run(() => { this.toggleReadingAppearance(false); this.onOpenAbsolutePath(); }),
      menuFileSave: run(() => this._menuSaveOrBackup()),
      menuFileSaveAs: run(() => this._menuSaveAsOrBackup()),
      menuDesktopNeed: run(() => this.openWorkspaceSettings?.('integrations')),
      menuFolder: run(() => { this.toggleReadingAppearance(false); this.associateLocalFolder(); }),
      menuSettings: run(() => this.openAISettings()),
      menuLongImage: run(() => this.openLongImage()),
      menuFind: run(() => {
        if (this.previewFullscreen || this.viewMode === 'preview') this.openPreviewSearch();
        else this.openSearch(false);
      }),
      menuAppearance: run(() => {
        this.openWorkspaceSettings('reading');
      }),
      menuLanguage: run(() => this.toggleInterfaceLanguage(true)),
      closeInterfaceLanguage: () => this.toggleInterfaceLanguage(false, true),
      menuReturnHome: run(() => {
        this.toggleReadingAppearance(false);
        if (this.previewFullscreen) this.togglePreviewFullscreen(false);
      })
    };
  }

  toggleFileMenu(force) {
    const menu = this.fileMenuRef.current, button = this.fileMenuButtonRef.current;
    if (!menu) return;
    const open = typeof force === 'boolean' ? force : !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    button?.setAttribute('aria-expanded', String(open));
    if (open) {
      this.toggleQuickAppearance?.(false);
      if (this.appearanceOpen) this.toggleReadingAppearance(false);
      if (this.languageOpen) this.toggleInterfaceLanguage(false);
      this._syncExportMenuCapabilities?.();
      this._refreshConnectorCapabilities?.();
    }
    if (open && !this._fileMenuDocH) {
      this._fileMenuDocH = (event) => {
        if (menu.contains(event.target) || button?.contains(event.target)) return;
        this.toggleFileMenu(false);
      };
      document.addEventListener('click', this._fileMenuDocH);
      document.addEventListener('focusin', this._fileMenuDocH);
    } else if (!open && this._fileMenuDocH) {
      document.removeEventListener('click', this._fileMenuDocH);
      document.removeEventListener('focusin', this._fileMenuDocH);
      this._fileMenuDocH = null;
    }
  }

  toggleExportMenu(force) {
    this.toggleFileMenu(force);
  }

  _handleWorkspaceMenuKey(event) {
    const menu = this.fileMenuRef.current, button = this.fileMenuButtonRef.current;
    if (!menu || !button) return false;
    const open = menu.classList.contains('is-open');
    if (open && event.key === 'Escape') {
      event.preventDefault();
      this.toggleFileMenu(false);
      button.focus();
      return true;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return false;
    const active = document.activeElement;
    if (active !== button && !(open && menu.contains(active))) return false;
    event.preventDefault();
    if (!open) this.toggleFileMenu(true);
    const items = [...menu.querySelectorAll('[role="menuitem"]')]
      .filter((item) => !item.disabled && !item.hidden && item.getClientRects().length);
    if (!items.length) return true;
    const index = items.indexOf(active);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : index < 0 ? (event.key === 'ArrowUp' ? items.length - 1 : 0)
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next].focus();
    return true;
  }

  _canWriteOpenFile() {
    return !!(typeof window !== 'undefined' && window.mojianDesktop)
      || !!(this.fileHandle && typeof this.fileHandle.createWritable === 'function');
  }

  _canWriteToDisk() {
    return this._canWriteOpenFile()
      || !!(typeof window !== 'undefined' && window.showSaveFilePicker);
  }

  _syncExportMenuCapabilities() {
    const menu = this.fileMenuRef?.current;
    if (!menu?.querySelectorAll) return;
    const canWrite = this._canWriteToDisk();
    menu.querySelectorAll('.write-disk-menu-item').forEach((el) => {
      el.hidden = !canWrite;
    });
    const desktopLink = menu.querySelector?.('.desktop-need-link');
    if (desktopLink) {
      const showLink = !this.agentBridgeEnabled;
      desktopLink.hidden = !showLink;
    }
    this._syncOpenDocLabel?.();
  }

  _syncOpenDocLabel() {
    const btn = typeof document !== 'undefined'
      ? document.querySelector('.open-doc-btn')
      : null;
    const label = btn?.querySelector('.open-doc-label');
    if (!btn || !label) return;
    const desktop = typeof window !== 'undefined' && window.mojianDesktop;
    if (desktop) {
      label.textContent = t('打开');
      label.setAttribute('data-i18n', '打开');
      btn.setAttribute('aria-label', t('打开文件'));
      btn.removeAttribute('title');
      btn.disabled = false;
      return;
    }
    // 静态 Web：导入 .md，避免「打开」点了无反馈的半残感
    label.textContent = t('导入 Markdown');
    label.setAttribute('data-i18n', '导入 Markdown');
    btn.setAttribute('aria-label', t('导入 Markdown'));
    btn.title = t('导入 Markdown');
    btn.disabled = false;
  }


  _menuSaveOrBackup() {
    if (this._canWriteOpenFile()) {
      this.onSave();
      return;
    }
    if (this._canWriteToDisk()) {
      this.onSaveAs();
      return;
    }
    this._setStatus(t('浏览器无法写盘，请用下载备份包'));
    void this.downloadFullBackup?.();
  }

  _menuSaveAsOrBackup() {
    if (this._canWriteToDisk()) {
      this.onSaveAs();
      return;
    }
    this._setStatus(t('浏览器无法写盘，请用下载备份包'));
    void this.downloadFullBackup?.();
  }

  toggleSelOverflow(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const wrap = this.selBarRef?.current?.querySelector?.('.seltool-overflow');
    const menu = wrap?.querySelector?.('.seltool-overflow-menu');
    const btn = wrap?.querySelector?.('.seltool-more');
    if (!menu || !btn) return;
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open && !this._selOverflowDocH) {
      this._selOverflowDocH = (e) => {
        if (wrap?.contains?.(e.target)) return;
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', this._selOverflowDocH);
        this._selOverflowDocH = null;
      };
      document.addEventListener('mousedown', this._selOverflowDocH);
    }
  }
}
