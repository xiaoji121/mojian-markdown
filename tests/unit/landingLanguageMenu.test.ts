import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStubElement } from '../helpers/dom.ts';
import { closeLandingLanguageMenu, focusLandingLanguageToggle, initLandingLanguageMenu } from '../../src/landing/languageMenu.ts';

function fixture() {
  const root = createStubElement();
  const summary = { focused: false, focus() { this.focused = true; document.activeElement = this; } };
  const link = {};
  const outside = {};
  const menu = { open: true, contains(node: unknown) { return node === summary || node === link || node === menu; } };
  const document = Object.assign(root, { activeElement: link, querySelector(selector: string) {
    return selector === '.landing-language-toggle' ? summary : selector === '.landing-language-menu' ? menu : null;
  } });
  initLandingLanguageMenu(document as unknown as Document);
  return { root: document as unknown as Document, document, summary, link, menu, outside };
}

test('Escape closes the landing language disclosure and restores its trigger', () => {
  const { document, summary, menu, link } = fixture();
  let prevented = false;
  document.dispatch('keydown', { key: 'Escape', target: link, preventDefault() { prevented = true; } });
  assert.equal(menu.open, false);
  assert.equal(summary.focused, true);
  assert.equal(prevented, true);
});

test('clicking outside closes the menu and restores focus stranded in its links', () => {
  const { document, summary, menu, outside } = fixture();
  document.dispatch('click', { target: outside });
  assert.equal(menu.open, false);
  assert.equal(summary.focused, true);
});

test('moving focus outside closes without taking focus from the next control', () => {
  const { document, summary, menu, outside } = fixture();
  document.activeElement = outside;
  document.dispatch('focusin', { target: outside });
  assert.equal(menu.open, false);
  assert.equal(summary.focused, false);
  assert.equal(document.activeElement, outside);
});

test('clicking a language link and moving focus within the menu leave navigation untouched', () => {
  const { document, summary, menu, link } = fixture();
  document.dispatch('click', { target: link });
  document.dispatch('focusin', { target: summary });
  document.dispatch('keydown', { key: 'Enter', target: summary });
  assert.equal(menu.open, true);
  assert.equal(summary.focused, false);
});

test('route changes can close without stealing focus, then focus the newly rendered trigger', () => {
  const { root, summary, menu } = fixture();
  closeLandingLanguageMenu(root);
  assert.equal(menu.open, false);
  assert.equal(summary.focused, false);
  focusLandingLanguageToggle(root);
  assert.equal(summary.focused, true);
});

test('closed disclosures and absent landing pages ignore unrelated input', () => {
  const { document, menu, summary, outside } = fixture();
  menu.open = false;
  document.dispatch('keydown', { key: 'Escape', target: outside, preventDefault() { throw Error('unrelated Escape'); } });
  assert.equal(summary.focused, false);
  document.querySelector = () => null;
  document.dispatch('click', { target: outside });
  document.dispatch('focusin', { target: outside });
  focusLandingLanguageToggle(document as unknown as Document);
});
