import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSettingsMethods } from '../../src/editor/workspaceSettingsMethods.ts';

function withSettings(mobile, run) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  let focused;
  const opener = { focus() { focused = 'mobile'; } };
  const menuItem = { focus() { focused = 'hidden menu'; } };
  const desktop = { setAttribute() {}, getBoundingClientRect: () => ({ bottom: 50, right: 400 }), focus() { focused = 'desktop'; } };
  const panel = { hidden: true, style: {}, offsetHeight: 240, offsetWidth: 290, focus() {}, setAttribute() {}, removeAttribute() {} };
  globalThis.document = { activeElement: menuItem };
  globalThis.window = { innerHeight: 844, innerWidth: 390 };
  const context = Object.assign(new WorkspaceSettingsMethods(), {
    _mobileMedia: { matches: mobile },
    _mobileMenu: { contains: element => element === menuItem },
    _mobileMenuReturnFocus: opener,
    _quickAppearance: panel,
    _quickAppearanceBackdrop: { hidden: true },
    _quickAppearanceButton: desktop,
    _syncQuickAppearance() {}, toggleFileMenu() {}, toggleExportMenu() {},
    _selectSettingsPage() {}, toggleReadingAppearance() {}
  });
  try { run(context, () => focused, opener); }
  finally { globalThis.document = previousDocument; globalThis.window = previousWindow; }
}

test('mobile quick sheet restores focus to its visible reading-menu opener', () => {
  withSettings(true, (context, focused) => {
    context.toggleQuickAppearance(true);
    assert.equal(context._quickAppearanceBackdrop.hidden, false);
    context.toggleQuickAppearance(false, true);
    assert.equal(context._quickAppearanceBackdrop.hidden, true);
    assert.equal(focused(), 'mobile');
  });
});

test('mobile full settings preserve reading-menu opener through direct and quick routes', () => {
  withSettings(true, (context, focused, opener) => {
    context.openWorkspaceSettings();
    assert.equal(context._settingsReturnFocus, opener);
    context.toggleQuickAppearance(true);
    context.openWorkspaceSettings();
    assert.equal(context._settingsReturnFocus, opener);
    assert.equal(context._quickAppearanceBackdrop.hidden, true);
  });
});

test('desktop quick appearance retains its toolbar focus target', () => {
  withSettings(false, (context, focused) => {
    context.toggleQuickAppearance(true);
    context.toggleQuickAppearance(false, true);
    assert.equal(focused(), 'desktop');
  });
});

test('mobile quick sheet traps keyboard focus while its backdrop is open', () => {
  withSettings(true, context => {
    const first = { disabled: false, tabIndex: 0, getClientRects: () => [1], focus() { globalThis.document.activeElement = first; } };
    const last = { disabled: false, tabIndex: 0, getClientRects: () => [1], focus() { globalThis.document.activeElement = last; } };
    context._quickAppearance.querySelectorAll = selector => selector === '[data-settings-tab]' ? [] : [first, last];
    context.toggleQuickAppearance(true);
    globalThis.document.activeElement = last;
    let prevented = false;
    context._handleWorkspaceSettingsKey({ key: 'Tab', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(globalThis.document.activeElement, first);
  });
});
