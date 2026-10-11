import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobileReadingMethods } from '../../src/editor/mobileReadingMethods.ts';

test('mobile menu actions close the menu before dispatch and preserve source state', () => {
  const calls: string[] = [];
  const context = { toggleMobileReadingMenu: (open: boolean) => calls.push('menu:' + open), openPreviewSearch: () => calls.push('find'), toggleQuickAppearance: () => calls.push('appearance'), openWorkspaceSettings: () => calls.push('settings'), togglePreviewFullscreen: () => calls.push('focus'), _showMobileExport: () => calls.push('export') };
  const values = MobileReadingMethods.prototype._mobileReadingRenderVals.call(context);
  values.mobileFind(); values.mobileAppearance(); values.mobileSettings(); values.mobileFocus(); values.mobileExport();
  assert.deepEqual(calls, ['menu:false', 'find', 'menu:false', 'appearance', 'menu:false', 'settings', 'menu:false', 'focus', 'export']);
});

test('mobile focus command is a toggle and does not force exit for settings', () => {
  let focus = true;
  const context = {toggleMobileReadingMenu() {}, togglePreviewFullscreen() { focus = !focus; }, openWorkspaceSettings() {}};
  const values = MobileReadingMethods.prototype._mobileReadingRenderVals.call(context);
  values.mobileSettings(); assert.equal(focus, true);
  values.mobileFocus(); assert.equal(focus, false);
});

test('heading navigation closes outline only on mobile', () => {
  const calls: boolean[] = [];
  const context = { _mobileMedia: {matches: false}, _openOutlinePanel: (open: boolean) => calls.push(open) };
  const event = {target: {closest: (selector: string) => selector === '.outline-tree-item'}};
  MobileReadingMethods.prototype._completeMobileNavigation.call(context, event);
  assert.deepEqual(calls, []);
  context._mobileMedia.matches = true;
  MobileReadingMethods.prototype._completeMobileNavigation.call(context, event);
  assert.deepEqual(calls, [false]);
});

test('mobile export uses its own sheet outside the inert desktop header', () => {
  const calls: boolean[] = [];
  const context = {_showMobileExport(show: boolean) {calls.push(show);}};
  const values = MobileReadingMethods.prototype._mobileReadingRenderVals.call(context);
  values.mobileExport(); values.mobileReadingTools();
  assert.deepEqual(calls, [true, false]);
});

test('mobile source find routes to source search and disk capabilities stay capability-driven', () => {
  const calls: string[] = [];
  const context = { viewMode: 'editor', toggleMobileReadingMenu() {}, openSearch: () => calls.push('source'), openPreviewSearch: () => calls.push('preview') };
  const values = MobileReadingMethods.prototype._mobileReadingRenderVals.call(context);
  values.mobileFind(); assert.deepEqual(calls, ['source']);
  const write = [{hidden: true}], publish = [{hidden: true, dataset: {mobilePublish: 'feishu'}}];
  const caps = { _mobileMenu: {querySelectorAll: (s: string) => s === '[data-mobile-write]' ? write : publish}, _canWriteToDisk: () => true, _connectorCapabilities: {feishu: {available: true}} };
  MobileReadingMethods.prototype._syncMobileExportCapabilities.call(caps);
  assert.equal(write[0].hidden, false); assert.equal(publish[0].hidden, false);
  caps._canWriteToDisk = () => false; caps._connectorCapabilities.feishu.available = false;
  MobileReadingMethods.prototype._syncMobileExportCapabilities.call(caps);
  assert.equal(write[0].hidden, true); assert.equal(publish[0].hidden, true);
});
