import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStubElement } from '../helpers/dom.ts';
import { initLandingNavigation } from '../../src/landing/navigation.ts';
import { syncDesktopLanding } from '../../src/landing/desktopLanding.ts';

function desktopFixture(run: (state: any) => void) {
  const document = Object.assign(createStubElement(), { activeElement: null as unknown,
    documentElement: { dataset: {}, lang: 'zh-CN' }, title: '' });
  const location = { hash: '', pathname: '/', href: 'http://localhost/' };
  const window = Object.assign(createStubElement(), { mojianDesktop: {}, location,
    dispatchEvent(event: Event) { this.dispatch(event.type, event); } });
  const frames: FrameRequestCallback[] = [];
  const newSummary = () => ({ focus() { document.activeElement = this; } });
  let summary = newSummary();
  let replacements = 0;
  const landing = { lang: 'zh-CN', set outerHTML(html: string) {
    this.lang = html.match(/id="landing-page" lang="([^"]+)"/)![1];
    replacements += 1;
    summary = newSummary();
    document.activeElement = null;
  } };
  class Anchor {
    href = 'http://localhost/#landing-ja';
    hash = '#landing-ja';
    closest() { return this; }
  }
  const link = new Anchor();
  const menu = { open: true, contains: (node: unknown) => node === link || node === summary };
  document.querySelector = ((selector: string) => selector === '.landing-language-menu' ? menu : summary) as any;
  (document as any).getElementById = () => landing;
  document.activeElement = link;
  const historyEntries: string[] = [];
  const history = { pushState(_state: unknown, _title: string, url: string) {
    historyEntries.push(url);
    location.hash = new URL(url, location.href).hash;
  } };
  const globals = { document, window, Element: Anchor, location, history,
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
    initLandingNavigation();
    window.addEventListener('hashchange', syncDesktopLanding);
    run({ document, window, location, link, menu, historyEntries,
      flushFrames: () => frames.splice(0).forEach(callback => callback(0)),
      summary: () => summary, replacements: () => replacements });
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
}

test('desktop locale clicks focus the new trigger without racing native hash navigation', () => {
  desktopFixture(({ document, window, location, link, menu, historyEntries, flushFrames, summary }) => {
    let prevented = false;
    document.dispatch('click', { target: link, button: 0, preventDefault() { prevented = true; } });
    if (!prevented) {
      location.hash = link.hash;
      window.dispatch('popstate');
      // CI can paint after the synthetic event but before the native hashchange.
      flushFrames();
      window.dispatch('hashchange');
    }
    flushFrames();
    assert.equal(document.activeElement, summary());
    assert.equal(menu.open, false);
    assert.equal(prevented, true, 'own the root-document hash navigation to avoid native focus resets');
    assert.deepEqual(historyEntries, ['#landing-ja']);
  });
});

test('reselecting the current desktop locale preserves the trigger and history entry', () => {
  desktopFixture(({ document, location, link, historyEntries, summary, replacements }) => {
    location.hash = link.hash;
    syncDesktopLanding();
    const rendered = summary();
    document.dispatch('click', { target: link, button: 0, preventDefault() {} });
    assert.equal(document.activeElement, rendered);
    assert.equal(summary(), rendered);
    assert.equal(replacements(), 1);
    assert.deepEqual(historyEntries, []);
  });
});

test('repeated desktop synchronization preserves the rendered landing and focused trigger', () => {
  desktopFixture(({ document, location, link, summary, replacements }) => {
    location.hash = link.hash;
    syncDesktopLanding();
    const rendered = summary();
    rendered.focus();
    syncDesktopLanding();
    assert.equal(replacements(), 1);
    assert.equal(document.activeElement, rendered);
    assert.equal(summary(), rendered);
  });
});

test('modified desktop locale clicks keep native browser behavior', () => {
  desktopFixture(({ document, link, menu, historyEntries }) => {
    document.dispatch('click', { target: link, button: 0, ctrlKey: true, preventDefault() { throw Error('modified click intercepted'); } });
    assert.equal(menu.open, true);
    assert.deepEqual(historyEntries, []);
  });
});
