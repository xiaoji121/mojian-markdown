import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStubElement } from '../helpers/dom.ts';
import { initLandingNavigation } from '../../src/landing/navigation.ts';

test('desktop language navigation restores focus after both history and native hash renders', async () => {
  const document = Object.assign(createStubElement(), { activeElement: null as unknown });
  const window = Object.assign(createStubElement(), { mojianDesktop: {}, dispatchEvent(event: Event) { this.dispatch(event.type, event); } });
  const frames: FrameRequestCallback[] = [];
  const newSummary = () => ({ focus() { document.activeElement = this; } });
  let summary = newSummary();
  class Anchor {
    href = 'http://localhost/#landing-ja';
    hash = '#landing-ja';
    closest() { return this; }
  }
  const link = new Anchor();
  const menu = { open: true, contains: (node: unknown) => node === link || node === summary };
  document.querySelector = ((selector: string) => selector === '.landing-language-menu' ? menu : summary) as any;
  document.activeElement = link;
  const globals = { document, window, Element: Anchor, location: { hash: '', pathname: '/' }, requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
    initLandingNavigation();
    // main.ts registers its desktop renderer after landing navigation.
    window.addEventListener('hashchange', () => { summary = newSummary(); document.activeElement = null; });
    document.dispatch('click', { target: link, button: 0 });
    globals.location.hash = '#landing-ja';
    window.dispatch('popstate');
    await Promise.resolve();
    window.dispatch('hashchange');
    await Promise.resolve();
    frames.forEach(callback => callback(0));
    assert.equal(menu.open, false);
    assert.equal(document.activeElement, summary);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});
