import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApplePlatform, menuShortcut, syncMenuShortcuts } from '../../src/editor/platformShortcuts.ts';

test('menu shortcuts follow platform', () => {
  assert.equal(isApplePlatform('MacIntel'), true);
  assert.equal(isApplePlatform('Linux x86_64'), false);
  assert.equal(menuShortcut('S', 'MacIntel'), '⌘S');
  assert.equal(menuShortcut('Shift+S', 'MacIntel'), '⌘⇧S');
  assert.equal(menuShortcut('S', 'Linux x86_64'), 'Ctrl+S');
  assert.equal(menuShortcut('Shift+S', 'Win32'), 'Ctrl+Shift+S');
});

test('syncMenuShortcuts updates data-mod-shortcut nodes', () => {
  const nodes = [
    { dataset: { modShortcut: 'S' }, textContent: '⌘S' },
    { dataset: { modShortcut: 'Shift+S' }, textContent: '⌘⇧S' }
  ];
  syncMenuShortcuts({ querySelectorAll: () => nodes } as any, 'Linux x86_64');
  assert.equal(nodes[0].textContent, 'Ctrl+S');
  assert.equal(nodes[1].textContent, 'Ctrl+Shift+S');
});
