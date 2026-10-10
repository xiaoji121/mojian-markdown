import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../src/editor/i18n.ts';
import {
  isApplePlatform,
  menuShortcut,
  modTitleKey,
  syncMenuShortcuts,
  syncModTitles
} from '../../src/editor/platformShortcuts.ts';

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

test('mod titles are platform-only (no dual ⌘/Ctrl labels)', () => {
  assert.equal(modTitleKey('undo', 'Linux x86_64'), '撤销（Ctrl+Z）');
  assert.equal(modTitleKey('undo', 'MacIntel'), '撤销（⌘Z）');
  assert.equal(modTitleKey('find', 'Win32'), '搜索替换（Ctrl+F）');
  assert.equal(modTitleKey('toggle-replace', 'MacIntel'), '切换替换（⌘⌥F）');
  assert.equal(modTitleKey('redo', 'Linux x86_64'), '重做（Ctrl+Y）');
});

test('syncModTitles sets title and data-i18n-title for Linux', () => {
  setLocale('zh-CN');
  const attrs: Record<string, string> = {};
  const node = {
    dataset: { modTitle: 'find' },
    title: '',
    setAttribute(name: string, value: string) { attrs[name] = value; }
  };
  syncModTitles({ querySelectorAll: () => [node] } as any, 'Linux x86_64');
  assert.equal(node.title, '搜索替换（Ctrl+F）');
  assert.equal(attrs['data-i18n-title'], '搜索替换（Ctrl+F）');
  assert.ok(!node.title.includes('⌘'));
});
