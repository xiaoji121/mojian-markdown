import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEditorState } from '../../desktop/editorState.js';
import { ViewMethods } from '../../src/editor/viewMethods.ts';
import { createStubElement, createRef } from '../helpers/dom.ts';
import { resolveDarkPaperSoftening } from '../../src/editor/desktopAppearanceMethods.ts';

test('softening defaults on only when no existing dark paper preference was explicit', () => {
  for (const state of [undefined, {}, { paperLight: 'cream' }]) assert.equal(resolveDarkPaperSoftening(state), true);
  for (const state of [{ paperDark: 'snow' }, { paper: 'parchment' }, { softenDarkPaper: false }]) {
    assert.equal(resolveDarkPaperSoftening(state), false);
  }
  assert.equal(resolveDarkPaperSoftening({ paperDark: 'snow', softenDarkPaper: true }), true);
});

test('desktop draft preserves an explicit false softening choice and rejects non-booleans', () => {
  assert.equal(sanitizeEditorState({ content: '# unchanged', softenDarkPaper: false }).softenDarkPaper, false);
  assert.equal(sanitizeEditorState({ content: '# unchanged', softenDarkPaper: true }).softenDarkPaper, true);
  assert.throws(() => sanitizeEditorState({ content: '# unchanged', softenDarkPaper: 'yes' }), /softenDarkPaper/);
});

test('paper application synchronizes desktop appearance without mutating paper choice or content', () => {
  const original = globalThis.document;
  const body = createStubElement();
  let synced = 0;
  (globalThis as any).document = { body };
  const context: any = { paperPickerRef: createRef(null), paperDark: 'snow', softenDarkPaper: true,
    _resolvedPaper: () => 'snow', _syncDesktopAppearance: () => { synced++; } };
  try {
    ViewMethods.prototype._applyPaper.call(context);
    assert.equal(synced, 1);
    assert.equal(context.paperDark, 'snow');
    assert.equal(body.getAttribute('data-paper'), 'snow');
  } finally { globalThis.document = original; }
});
