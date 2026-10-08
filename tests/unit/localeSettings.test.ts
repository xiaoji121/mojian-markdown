import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncLocaleSettings } from '../../src/editor/localeSettings.ts';

test('global language options reflect current selection without touching document content', () => {
  const items = ['zh-CN', 'zh-TW', 'en', 'ja'].map(locale => ({
    dataset: { locale }, attrs: {} as Record<string, string>, tabIndex: 0,
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
  }));
  const root = { querySelectorAll: () => items };
  syncLocaleSettings(root as any, 'ja');
  assert.deepEqual(items.map(item => item.attrs['aria-checked']), ['false', 'false', 'false', 'true']);
  assert.deepEqual(items.map(item => item.tabIndex), [-1, -1, -1, 0]);
});

test('language keyboard controls wrap, select, focus and clean up listeners', async () => {
  const { bindLocaleSettings } = await import('../../src/editor/localeSettings.ts');
  let focused = '', selected = '';
  const items = ['zh-CN', 'zh-TW', 'en', 'ja'].map(locale => ({
    dataset: { locale }, listeners: new Map(), focus() { focused = locale; },
    addEventListener(key: string, listener: unknown) { this.listeners.set(key, listener); },
    removeEventListener(key: string) { this.listeners.delete(key); }
  }));
  const dispose = bindLocaleSettings({ querySelectorAll: () => items } as any, locale => { selected = locale; });
  let prevented = false;
  items[0].listeners.get('keydown')({ key: 'ArrowLeft', currentTarget: items[0], preventDefault() { prevented = true; } });
  assert.equal(selected, 'ja'); assert.equal(focused, 'ja'); assert.equal(prevented, true);
  items[3].listeners.get('keydown')({ key: 'Home', currentTarget: items[3], preventDefault() {} });
  assert.equal(selected, 'zh-CN');
  items[2].listeners.get('click')({ currentTarget: items[2] });
  assert.equal(selected, 'en');
  dispose(); assert.ok(items.every(item => item.listeners.size === 0));
});
