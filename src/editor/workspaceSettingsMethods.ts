// @ts-nocheck
import { t } from './i18n.ts';

export class WorkspaceSettingsMethods {
  _workspaceSettingsRenderVals() {
    return {
      openWorkspaceSettings: () => this.openWorkspaceSettings('reading'),
      settingsGeneral: () => this._selectSettingsPage('general'),
      settingsReading: () => this._selectSettingsPage('reading'),
      settingsAI: () => this._selectSettingsPage('ai'),
      settingsIntegrations: () => this._selectSettingsPage('integrations'),
      toggleQuickAppearance: () => this.toggleQuickAppearance(),
      closeQuickAppearance: () => this.toggleQuickAppearance(false, true)
    };
  }

  _initReadingAppearance() {
    this._settingsBackdrop = document.querySelector('.workspace-settings-backdrop');
    this._quickAppearance = document.querySelector('.quick-appearance-panel');
    this._quickAppearanceButton = document.querySelector('.quick-appearance-toggle');
    this.appearancePanelRef.current.hidden = true;
    this._settingsBackdrop.hidden = true;
    this._quickAppearance.hidden = true;
    this._appearanceOutsideH = event => {
      if (event.target === this._settingsBackdrop) {
        event.preventDefault();
        this.toggleReadingAppearance(false, true);
      }
      if (this.quickAppearanceOpen && !this._quickAppearance?.contains(event.target)
        && !this._quickAppearanceButton?.contains(event.target)) this.toggleQuickAppearance(false);
    };
    document.addEventListener('pointerdown', this._appearanceOutsideH);
    this._selectSettingsPage('reading');
    this._syncQuickAppearance();
  }

  openWorkspaceSettings(page = 'reading') {
    this._settingsReturnFocus = document.activeElement;
    if (this.quickAppearanceOpen) this._settingsReturnFocus = this._quickAppearanceButton;
    this.toggleFileMenu(false);
    this.toggleExportMenu(false);
    this.toggleQuickAppearance(false);
    this._selectSettingsPage(page);
    this.toggleReadingAppearance(true);
  }

  _selectSettingsPage(page) {
    const panel = this.appearancePanelRef.current;
    if (!panel) return;
    this._settingsPage = page;
    panel.querySelectorAll('[data-settings-tab]').forEach(tab => {
      const active = tab.dataset.settingsTab === page;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panel.querySelectorAll('[data-settings-page]').forEach(section => {
      section.hidden = section.dataset.settingsPage !== page;
    });
  }

  toggleReadingAppearance(force, returnFocus = false) {
    const panel = this.appearancePanelRef.current;
    if (!panel) return;
    const next = typeof force === 'boolean' ? force : !this.appearanceOpen;
    if (next && !this.appearanceOpen && !this._settingsReturnFocus) this._settingsReturnFocus = document.activeElement;
    this.appearanceOpen = next;
    panel.hidden = !next;
    if (this._settingsBackdrop) this._settingsBackdrop.hidden = !next;
    if (next) {
      this._renderUserReadingFonts?.();
      panel.focus({ preventScroll: true });
    } else {
      if (returnFocus) this._settingsReturnFocus?.focus?.({ preventScroll: true });
      this._settingsReturnFocus = null;
      this.languageOpen = false;
    }
  }

  toggleQuickAppearance(force, returnFocus = false) {
    const panel = this._quickAppearance;
    if (!panel) return;
    this.quickAppearanceOpen = typeof force === 'boolean' ? force : !this.quickAppearanceOpen;
    panel.hidden = !this.quickAppearanceOpen;
    this._quickAppearanceButton?.setAttribute('aria-expanded', String(this.quickAppearanceOpen));
    if (this.quickAppearanceOpen) {
      this.toggleFileMenu(false);
      this.toggleExportMenu(false);
      this._syncQuickAppearance();
      const bounds = this._quickAppearanceButton.getBoundingClientRect();
      panel.style.top = Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - panel.offsetHeight - 12)) + 'px';
      panel.style.left = Math.max(12, Math.min(bounds.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 12)) + 'px';
      panel.focus({ preventScroll: true });
    } else if (returnFocus) this._quickAppearanceButton?.focus({ preventScroll: true });
  }

  _syncQuickAppearance() {
    const panel = this._quickAppearance;
    if (!panel) return;
    panel.querySelector('.quick-font-value').textContent = this.fontSize + 'px';
    const picker = panel.querySelector('.quick-paper-picker');
    if (!picker.childElementCount) {
      this.PAPERS().forEach(paper => {
        const button = document.createElement('button');
        button.className = 'quick-paper-dot';
        button.dataset.paper = paper.id;
        button.style.background = paper.swatch;
        button.addEventListener('click', () => this.setPaper(paper.id));
        picker.appendChild(button);
      });
    }
    picker.querySelectorAll('button').forEach(button => {
      const paper = this.PAPERS().find(item => item.id === button.dataset.paper);
      button.setAttribute('aria-label', t('纸色：{paper}', { paper: paper.label }));
      button.setAttribute('aria-pressed', String(button.dataset.paper === this._resolvedPaper()));
    });
  }

  _handleWorkspaceSettingsKey(event) {
    // The existing credentials dialog owns its own focus and Escape handling.
    if (this._aiSettingsEl?.style.display === 'flex') return false;
    if ((event.metaKey || event.ctrlKey) && event.key === ',') {
      event.preventDefault();
      this.openWorkspaceSettings();
      return true;
    }
    if (event.key === 'Escape' && (this.quickAppearanceOpen || this.appearanceOpen)) {
      event.preventDefault();
      if (this.quickAppearanceOpen) this.toggleQuickAppearance(false, true);
      else this.toggleReadingAppearance(false, true);
      return true;
    }
    if (!this.appearanceOpen) return false;
    const panel = this.appearancePanelRef.current;
    const tabs = [...panel.querySelectorAll('[data-settings-tab]')];
    const index = tabs.indexOf(document.activeElement);
    if (index >= 0 && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowUp' ? -1 : 1) + tabs.length) % tabs.length;
      this._selectSettingsPage(tabs[next].dataset.settingsTab);
      tabs[next].focus();
      return true;
    }
    if (event.key === 'Tab') {
      const controls = [...panel.querySelectorAll('button, input, select, a, summary, [tabindex="0"]')]
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    return false;
  }

  _disposeReadingAppearance() {
    document.removeEventListener('pointerdown', this._appearanceOutsideH);
  }
}
