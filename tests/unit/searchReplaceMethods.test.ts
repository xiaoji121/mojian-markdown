import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SearchReplaceMethods } from '../../src/editor/searchReplaceMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

// 与 editingFileLayoutMethods.test.ts 的 createSource 一致：赋值 value 把光标移到末尾。
function createSource(value: string, selectionStart = 0, selectionEnd = selectionStart) {
  let currentValue = value;
  return {
    selectionStart,
    selectionEnd,
    scrollTop: 0,
    scrollLeft: 0,
    clientHeight: 400,
    focused: false,
    get value() { return currentValue; },
    set value(next: string) {
      currentValue = next;
      this.selectionStart = next.length;
      this.selectionEnd = next.length;
    },
    setSelectionRange(start: number, end: number) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    focus() { this.focused = true; }
  };
}

function createInput(value = '') {
  return {
    value,
    focused: false,
    selected: false,
    focus() { this.focused = true; },
    select() { this.selected = true; },
    addEventListener() {}
  };
}

function createEditor(sourceText: string, selectionStart = 0, selectionEnd = selectionStart) {
  const source = createSource(sourceText, selectionStart, selectionEnd);
  const editor = new SearchReplaceMethods() as SearchReplaceMethods & Record<string, any>;
  editor.sourceRef = createRef(source);
  editor.searchBarRef = createRef(createStubElement());
  editor.searchInputRef = createRef(createInput());
  editor.replaceInputRef = createRef(createInput());
  editor.searchCountRef = createRef(createStubElement());
  editor.searchCaseRef = createRef(createStubElement());
  editor.searchOpen = false;
  editor.searchCaseSensitive = false;
  editor._searchMatches = [];
  editor._searchIndex = -1;
  editor._searchAnchor = 0;
  editor.viewMode = 'split';
  editor.calls = [] as string[];
  editor._syncCurrentEditingState = () => {};
  editor._recordEditingHistory = (_type: string, force?: boolean) => {
    editor.calls.push('record' + (force ? ':force' : ''));
  };
  editor._renderPreview = () => { editor.calls.push('preview'); };
  editor._touch = () => { editor.calls.push('touch'); };
  editor._setStatus = (msg: string) => { editor.statusMsg = msg; };
  return editor;
}

test('搜索默认忽略大小写并统计全部匹配', () => {
  const editor = createEditor('Alpha beta alpha');
  editor.searchInputRef.current.value = 'alpha';

  editor._updateSearchMatches();

  assert.deepEqual(editor._searchMatches, [0, 11]);
  assert.equal(editor.searchCountRef.current.textContent, '1/2');
  const source = editor.sourceRef.current;
  assert.deepEqual([source.selectionStart, source.selectionEnd], [0, 5]);
});

test('开启区分大小写后只匹配精确大小写', () => {
  const editor = createEditor('Alpha beta alpha');
  editor.searchInputRef.current.value = 'alpha';
  editor.searchCaseSensitive = true;

  editor._updateSearchMatches();

  assert.deepEqual(editor._searchMatches, [11]);
  assert.equal(editor.searchCountRef.current.textContent, '1/1');
});

test('空关键字不产生匹配也不报错', () => {
  const editor = createEditor('Alpha beta alpha');

  editor._updateSearchMatches();

  assert.deepEqual(editor._searchMatches, []);
  assert.equal(editor._searchIndex, -1);
});

test('从打开搜索时的光标位置定位第一处匹配', () => {
  const editor = createEditor('alpha beta alpha', 6, 6);
  editor.searchInputRef.current.value = 'alpha';
  editor._searchAnchor = 6;

  editor._updateSearchMatches();

  assert.equal(editor._searchIndex, 1);
  assert.equal(editor.searchCountRef.current.textContent, '2/2');
});

test('下一处/上一处循环跳转并选中匹配', () => {
  const editor = createEditor('alpha beta alpha');
  editor.searchInputRef.current.value = 'alpha';
  editor._updateSearchMatches();
  const source = editor.sourceRef.current;

  editor.searchNext();
  assert.deepEqual([source.selectionStart, source.selectionEnd], [11, 16]);
  assert.equal(editor.searchCountRef.current.textContent, '2/2');

  editor.searchNext(); // 到末尾后回绕到第一处
  assert.deepEqual([source.selectionStart, source.selectionEnd], [0, 5]);

  editor.searchPrev(); // 从第一处回绕到最后一处
  assert.deepEqual([source.selectionStart, source.selectionEnd], [11, 16]);
});

test('替换当前匹配并跳到下一处，记录独立的撤销历史', () => {
  const editor = createEditor('alpha beta alpha');
  editor.searchInputRef.current.value = 'alpha';
  editor.replaceInputRef.current.value = 'omega';
  editor._updateSearchMatches();

  editor.replaceCurrent();

  const source = editor.sourceRef.current;
  assert.equal(source.value, 'omega beta alpha');
  // 替换后自动选中下一处匹配
  assert.deepEqual([source.selectionStart, source.selectionEnd], [11, 16]);
  assert.ok(editor.calls.includes('record:force'));
  assert.ok(editor.calls.includes('preview'));
  assert.ok(editor.calls.includes('touch'));
});

test('全部替换按原文各处大小写匹配，替换文本中的 $ 保持字面量', () => {
  const editor = createEditor('Alpha beta alpha');
  editor.searchInputRef.current.value = 'alpha';
  editor.replaceInputRef.current.value = 'a$b';

  editor.replaceAll();

  assert.equal(editor.sourceRef.current.value, 'a$b beta a$b');
  assert.ok(editor.statusMsg.includes('2'));
  assert.ok(editor.calls.includes('record:force'));
  assert.ok(editor.calls.includes('preview'));
  assert.ok(editor.calls.includes('touch'));
});

test('无匹配时替换不改动原文', () => {
  const editor = createEditor('alpha beta');
  editor.searchInputRef.current.value = 'missing';
  editor.replaceInputRef.current.value = 'x';
  editor._updateSearchMatches();

  editor.replaceCurrent();
  editor.replaceAll();

  assert.equal(editor.sourceRef.current.value, 'alpha beta');
  assert.equal(editor.calls.length, 0);
});

test('打开搜索时预填原文中的单行选区并聚焦输入框', () => {
  const editor = createEditor('alpha beta alpha', 6, 10);

  editor.openSearch();

  assert.equal(editor.searchOpen, true);
  assert.ok(editor.searchBarRef.current.classList.contains('is-open'));
  assert.equal(editor.searchInputRef.current.value, 'beta');
  assert.equal(editor.searchInputRef.current.focused, true);
});

test('关闭搜索后隐藏搜索条并把焦点还给编辑器', () => {
  const editor = createEditor('alpha beta');
  editor.openSearch();

  editor.closeSearch();

  assert.equal(editor.searchOpen, false);
  assert.equal(editor.searchBarRef.current.classList.contains('is-open'), false);
  assert.equal(editor.sourceRef.current.focused, true);
});

test('快捷键：⌘F 打开搜索、Ctrl+H 打开并聚焦替换、Esc 关闭', () => {
  const editor = createEditor('alpha beta');
  const event = (key: string, mods: Record<string, boolean> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    prevented: false,
    preventDefault() { this.prevented = true; },
    ...mods
  });

  const find = event('f', { metaKey: true });
  assert.equal(editor._handleSearchShortcut(find), true);
  assert.equal(find.prevented, true);
  assert.equal(editor.searchOpen, true);

  editor.closeSearch();
  const replace = event('h', { ctrlKey: true });
  assert.equal(editor._handleSearchShortcut(replace), true);
  assert.equal(editor.searchOpen, true);
  assert.equal(editor.replaceInputRef.current.focused, true);

  const esc = event('Escape');
  assert.equal(editor._handleSearchShortcut(esc), true);
  assert.equal(editor.searchOpen, false);

  assert.equal(editor._handleSearchShortcut(event('f')), false);
});
