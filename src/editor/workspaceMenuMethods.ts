// @ts-nocheck
// 文档与应用操作统一入口；格式工具仍由编辑区域负责。
export class WorkspaceMenuMethods {
  _workspaceMenuRenderVals() {
    const run = (action) => () => { this.toggleFileMenu(false); action(); };
    return {
      toggleFileMenu: () => this.toggleFileMenu(),
      menuFileNew: run(() => this.onNew()),
      menuFileOpen: run(() => this.onOpen()),
      menuOpenAbsolutePath: run(() => this.onOpenAbsolutePath()),
      menuFileSave: run(() => this.onSave()),
      menuFileSaveAs: run(() => this.onSaveAs()),
      menuFolder: run(() => this.associateLocalFolder()),
      menuSettings: run(() => this.openAISettings()),
      menuLongImage: run(() => this.openLongImage()),
      menuFind: run(() => {
        if (this.previewFullscreen || this.viewMode === 'preview') this.openPreviewSearch();
        else this.openSearch(false);
      }),
      menuAppearance: run(() => {
        if (this.viewMode === 'editor') this.setViewMode('preview');
        if (this.previewRef.current) this.previewRef.current.scrollTop = 0;
        this.toggleReadingAppearance(true);
        this.appearanceButtonRef.current?.focus();
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
      if (this.appearanceOpen) this.toggleReadingAppearance(false);
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
      .filter((item) => !item.disabled && item.getClientRects().length);
    if (!items.length) return true;
    const index = items.indexOf(active);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : index < 0 ? (event.key === 'ArrowUp' ? items.length - 1 : 0)
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next].focus();
    return true;
  }
}
