// @ts-nocheck
import { t } from './i18n.ts';
// Mobile presentation delegates to existing reading commands; document data stays owned by them.
export class MobileReadingMethods {
  _mobileReadingRenderVals() {
    const run = action => event => {
      event?.stopPropagation?.();
      this.toggleMobileReadingMenu(false, true);
      action();
    };
    return {
      toggleMobileReadingMenu: () => this.toggleMobileReadingMenu(),
      closeMobileReadingMenu: () => this.toggleMobileReadingMenu(false, true),
      mobileFind: run(() => {
        if (this.previewFullscreen || this.viewMode !== 'editor') this.openPreviewSearch();
        else this.openSearch(false);
      }),
      mobileAppearance: run(() => this.toggleQuickAppearance(true)),
      mobileSettings: run(() => this.openWorkspaceSettings()),
      mobileFocus: run(() => this.togglePreviewFullscreen()),
      mobileExport: () => this._showMobileExport(true),
      mobileReadingTools: () => this._showMobileExport(false),
      mobileOutline: run(() => this._openOutlinePanel(true)),
      mobileComments: run(() => this._openPanel(true)),
      mobileBackup: run(() => { void this._mfExport('backup'); }),
      mobileSourceDownload: run(() => this._mfExport('source')),
      mobileAnnotationsDownload: run(() => this._mfExport('annotations')),
      mobileLongImage: run(() => this.openLongImage()),
      mobileCopyFull: run(() => this.copyFull()),
      mobileSave: run(() => this._menuSaveOrBackup()),
      mobileSaveAs: run(() => this._menuSaveAsOrBackup()),
      mobilePublishFeishu: run(() => this.publishToFeishu()),
      mobilePublishDingtalk: run(() => this.publishToDingtalk())
    };
  }

  _initMobileReading() {
    this._initMobileAnnotations?.();
    this._initMobileEditing?.();
    this._mobileMenu = document.querySelector('.mobile-reading-menu');
    this._mobileBackdrop = document.querySelector('.mobile-reading-backdrop');
    this._mobileMedia = window.matchMedia('(max-width: 760px)');
    this.toggleMobileReadingMenu(false);
    this._showMobileExport(false, false);
    this._mobileBreakpoint = () => {
      const hadOverlay = this._mobileMenuOpen || this.quickAppearanceOpen || this.appearanceOpen;
      this.toggleMobileReadingMenu(false);
      this.toggleQuickAppearance(false);
      this.toggleReadingAppearance(false);
      this.documentSidebarRef.current?.classList.remove('is-mobile-open');
      if (this._mobileMedia.matches) {
        if (this.aiPanelOpen) this._openAIPanel(false);
        this.closeAISettings?.();
      }
      this._syncDocumentSidebar();
      if (hadOverlay) {
        const candidates = document.querySelectorAll('.focus-exit-sticky, .mobile-menu-toggle, .workspace-settings-button, .document-toggle, .view-mode-option');
        [...candidates].find(button => button.getClientRects().length && getComputedStyle(button).visibility === 'visible' && !button.closest('[inert]'))?.focus({ preventScroll: true });
      }
    };
    this._mobileMedia.addEventListener('change', this._mobileBreakpoint);
    this._mobileMenuKey = event => {
      if (!this._mobileMenuOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        this.toggleMobileReadingMenu(false, true);
      } else if (event.key === 'Tab') {
        const buttons = [...this._mobileMenu.querySelectorAll('button, summary')].filter(button => button.getClientRects().length);
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', this._mobileMenuKey, true);
    this._mobileNavigationClick = event => this._completeMobileNavigation(event);
    document.addEventListener('click', this._mobileNavigationClick);
  }

  toggleMobileReadingMenu(force, restoreFocus = false) {
    if (!this._mobileMenu) return;
    const open = (typeof force === 'boolean' ? force : !this._mobileMenuOpen)
      && this._mobileMedia.matches;
    if (open) {
      this._mobileMenuReturnFocus = document.activeElement;
      this._showMobileExport(false, false);
      this.toggleQuickAppearance(false);
      this.toggleFileMenu(false);
      this.toggleReadingAppearance(false);
      const focusButton = this._mobileMenu.querySelector('[data-mobile-action="focus"]');
      focusButton.setAttribute('aria-pressed', String(this.previewFullscreen));
      const label = focusButton.querySelector('[data-i18n]');
      const key = this.previewFullscreen ? '退出专注' : '专注';
      label.dataset.i18n = key;
      label.textContent = t(key);
    }
    this._mobileMenuOpen = open;
    this._mobileMenu.hidden = !open;
    this._mobileBackdrop.hidden = !open;
    document.querySelectorAll('.mobile-menu-toggle').forEach(button => button.setAttribute('aria-expanded', String(open)));
    if (open) this._mobileMenu.querySelector('button').focus({ preventScroll: true });
    else if (restoreFocus) this._mobileMenuReturnFocus?.focus({ preventScroll: true });
  }

  _showMobileExport(show, focus = true) {
    const tools = this._mobileMenu.querySelector('.mobile-reading-actions');
    const exports = this._mobileMenu.querySelector('.mobile-export-actions');
    const heading = this._mobileMenu.querySelector('h2');
    if (heading) { heading.dataset.i18n = show ? '导出' : '阅读工具'; heading.textContent = t(heading.dataset.i18n); }
    this._mobileMenu.dataset.i18nAriaLabel = show ? '导出' : '阅读工具';
    this._mobileMenu.setAttribute('aria-label', t(this._mobileMenu.dataset.i18nAriaLabel));
    this._mobileMenu.scrollTop = 0;
    if (show) {
      const secondary = exports.querySelector('details');
      if (secondary) secondary.open = true;
      this._syncMobileExportCapabilities();
      void this._refreshConnectorCapabilities?.().then(() => this._syncMobileExportCapabilities());
    }
    tools.hidden = show;
    exports.hidden = !show;
    if (focus) (show ? exports.querySelector('button') : tools.querySelector('[data-mobile-action="export"]')).focus({ preventScroll: true });
  }

  _syncMobileExportCapabilities() {
    const canWrite = this._canWriteToDisk();
    const saveGroup = this._mobileMenu.querySelector?.('.mobile-export-save');
    if (saveGroup) saveGroup.hidden = !canWrite;
    this._mobileMenu.querySelectorAll('[data-mobile-write]').forEach(button => {
      button.hidden = !canWrite;
    });
    this._mobileMenu.querySelectorAll('[data-mobile-publish]').forEach(button => {
      button.hidden = !this._connectorCapabilities?.[button.dataset.mobilePublish]?.available;
    });
  }

  _completeMobileNavigation(event) {
    if (!this._mobileMedia?.matches) return;
    if (event.target.closest?.('.outline-tree-item')) this._openOutlinePanel(false);
    if (event.target.closest?.('.recent-document-item')) this.closeDocumentSidebar();
  }

  _disposeMobileReading() {
    this._mobileMedia?.removeEventListener('change', this._mobileBreakpoint);
    document.removeEventListener('keydown', this._mobileMenuKey, true);
    document.removeEventListener('click', this._mobileNavigationClick);
  }
}
