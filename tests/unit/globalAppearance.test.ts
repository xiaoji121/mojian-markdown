import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSettingsMethods } from '../../src/editor/workspaceSettingsMethods.ts';
import { ViewMethods } from '../../src/editor/viewMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

test('global appearance opens without a preview button and returns focus without scrolling', () => {
  let focused: unknown = null;
  const panel = { hidden: true, focus(options: unknown) { focused = options; } };
  const more = { focus(options: unknown) { focused = options; } };
  const context = {
    appearancePanelRef: createRef(panel), appearanceButtonRef: createRef(),
    _settingsReturnFocus: more, appearanceOpen: false,
    _syncReadingToolbarScroll() { throw new Error('Global settings must not update reading scroll'); }
  };
  WorkspaceSettingsMethods.prototype.toggleReadingAppearance.call(context, true);
  assert.equal(panel.hidden, false);
  assert.equal(context.appearanceOpen, true);
  assert.deepEqual(focused, { preventScroll: true });
  WorkspaceSettingsMethods.prototype.toggleReadingAppearance.call(context, false, true);
  assert.equal(panel.hidden, true);
  assert.deepEqual(focused, { preventScroll: true });
});

test('scrolling reading tools out of view leaves global settings open', () => {
  const toolbar = Object.assign(createStubElement(), { offsetTop: 20, offsetHeight: 36 });
  const prev = { scrollTop: 0 };
  const context = {
    previewPaneRef: createRef({
      querySelector(sel: string) {
        if (sel === '.reading-toolbar') return toolbar;
        if (sel === '.focus-exit-sticky') return { hidden: true };
        return null;
      }
    }),
    previewRef: createRef(prev), viewMode: 'preview',
    appearanceOpen: true, previewFullscreen: false,
    toggleReadingAppearance() { throw new Error('Global settings must stay open'); }
  };
  ViewMethods.prototype._syncReadingToolbarScroll.call(context);
  prev.scrollTop = 500;
  ViewMethods.prototype._syncReadingToolbarScroll.call(context);
  assert.equal(toolbar.classList.contains('is-scrolled-away'), true);
  assert.equal(context.appearanceOpen, true);
});
