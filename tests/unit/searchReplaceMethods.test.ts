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

  assert.deepEqual(editor._searchMatches, [{ start: 0, end: 5 }, { start: 11, end: 16 }]);
  assert.equal(editor.searchCountRef.current.textContent, '第 1 项，共 2 项');
  const source = editor.sourceRef.current;
  assert.deepEqual([source.selectionStart, source.selectionEnd], [0, 5]);
});

test('开启区分大小写后只匹配精确大小写', () => {
  const editor = createEditor('Alpha beta alpha');
  editor.searchInputRef.current.value = 'alpha';
  editor.searchCaseSensitive = true;

  editor._updateSearchMatches();

  assert.deepEqual(editor._searchMatches, [{ start: 11, end: 16 }]);
  assert.equal(editor.searchCountRef.current.textContent, '第 1 项，共 1 项');
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
  assert.equal(editor.searchCountRef.current.textContent, '第 2 项，共 2 项');
});

test('下一处/上一处循环跳转并选中匹配', () => {
  const editor = createEditor('alpha beta alpha');
  editor.searchInputRef.current.value = 'alpha';
  editor._updateSearchMatches();
  const source = editor.sourceRef.current;

  editor.searchNext();
  assert.deepEqual([source.selectionStart, source.selectionEnd], [11, 16]);
  assert.equal(editor.searchCountRef.current.textContent, '第 2 项，共 2 项');

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

// ===== ⌘F 按视图路由 & 源码镜像高亮层 =====

test('预览模式与沉浸式下 ⌘F 路由到预览搜索', () => {
  const editor = Object.create(SearchReplaceMethods.prototype);
  let previewOpened = 0;
  let sourceOpened = 0;
  Object.assign(editor, {
    viewMode: 'preview',
    previewFullscreen: false,
    openPreviewSearch() { previewOpened += 1; },
    openSearch() { sourceOpened += 1; }
  });
  const press = () => editor._handleSearchShortcut({ key: 'f', metaKey: true, preventDefault() {} });

  assert.equal(press(), true);
  assert.equal(previewOpened, 1);

  editor.viewMode = 'split';
  editor.previewFullscreen = true;
  press();
  assert.equal(previewOpened, 2, '沉浸式下也应打开预览搜索');

  editor.previewFullscreen = false;
  press();
  assert.equal(sourceOpened, 1, '分屏回到源码搜索');
});

test('Esc 优先关闭预览搜索', () => {
  const editor = Object.create(SearchReplaceMethods.prototype);
  let closed = 0;
  Object.assign(editor, {
    previewSearchOpen: true,
    previewFullscreen: true,
    searchOpen: false,
    closePreviewSearch() { closed += 1; this.previewSearchOpen = false; }
  });

  assert.equal(editor._handleSearchShortcut({ key: 'Escape', preventDefault() {} }), true);
  assert.equal(closed, 1);
});

test('源码搜索渲染镜像高亮层：转义原文、标记全部匹配与当前项', () => {
  const editor = Object.create(SearchReplaceMethods.prototype);
  const layer = { innerHTML: '', scrollTop: 0 };
  const src = createSource('a <b> a');
  src.scrollTop = 120;
  Object.assign(editor, {
    searchOpen: true,
    sourceRef: createRef(src),
    searchInputRef: createRef(createInput('a')),
    sourceHighlightRef: createRef(layer)
  });
  editor._searchMatches = [{ start: 0, end: 1 }, { start: 6, end: 7 }];
  editor._searchIndex = 1;

  editor._renderSourceHighlights();

  assert.equal(
    layer.innerHTML,
    '<mark class="source-mark">a</mark> &lt;b&gt; <mark class="source-mark is-current">a</mark>\n'
  );
  assert.equal(layer.scrollTop, 120, '渲染后滚动位置与原文对齐');

  editor.searchOpen = false;
  editor._renderSourceHighlights();
  assert.equal(layer.innerHTML, '', '关闭搜索后清空高亮层');
});

test('镜像层字号同步 textarea 的内联 font-size，不拷贝 font 简写', () => {
  const editor = Object.create(SearchReplaceMethods.prototype);
  const layer = { innerHTML: '', scrollTop: 0, style: {} as Record<string, string> };
  const src = createSource('money talks') as ReturnType<typeof createSource> & {
    style: Record<string, string>;
  };
  src.style = { fontSize: '18px' };
  Object.assign(editor, {
    searchOpen: true,
    sourceRef: createRef(src),
    searchInputRef: createRef(createInput('money')),
    sourceHighlightRef: createRef(layer)
  });
  editor._searchMatches = [{ start: 0, end: 5 }];
  editor._searchIndex = 0;

  editor._renderSourceHighlights();
  assert.equal(layer.style.fontSize, '18px', '字号控件改过字号后镜像层跟随同一内联值');
  assert.equal(
    layer.style.font,
    undefined,
    '不得整份拷贝 font 简写：行高 1.85 会被序列化成绝对 px，长文档里逐行累积出高亮偏移'
  );

  src.style.fontSize = '';
  editor._renderSourceHighlights();
  assert.equal(layer.style.fontSize, '', '恢复默认字号时镜像层一并回落到 CSS 默认');
});

// ===== VS Code 风格：全字匹配 / 正则 / 替换行折叠 =====

test('全字匹配只命中独立单词', () => {
  const editor = createEditor('cat concat cat. scatter');
  editor.searchInputRef.current.value = 'cat';
  editor.searchWholeWord = true;

  editor._updateSearchMatches();

  assert.deepEqual(editor._searchMatches, [{ start: 0, end: 3 }, { start: 11, end: 14 }]);
});

test('正则模式支持变长匹配，无效表达式提示且不抛错', () => {
  const editor = createEditor('a aa aaa b');
  editor.searchInputRef.current.value = 'a+';
  editor.searchRegex = true;

  editor._updateSearchMatches();
  assert.deepEqual(editor._searchMatches, [
    { start: 0, end: 1 }, { start: 2, end: 4 }, { start: 5, end: 8 }
  ]);
  assert.equal(editor.searchCountRef.current.textContent, '第 1 项，共 3 项');

  editor.searchInputRef.current.value = '(未闭合';
  editor._updateSearchMatches();
  assert.deepEqual(editor._searchMatches, []);
  assert.equal(editor.searchCountRef.current.textContent, '表达式无效');
});

test('正则替换支持 $1 分组引用', () => {
  const editor = createEditor('宽 12px 高 34px');
  editor.searchInputRef.current.value = '(\\d+)px';
  editor.searchRegex = true;
  editor.replaceInputRef.current.value = '$1rem';
  editor._updateSearchMatches();

  editor.replaceCurrent();
  assert.equal(editor.sourceRef.current.value, '宽 12rem 高 34px');

  editor.replaceAll();
  assert.equal(editor.sourceRef.current.value, '宽 12rem 高 34rem');
});

test('替换行默认折叠，⌘⌥F 打开时展开，箭头可切换', () => {
  const editor = createEditor('alpha');
  editor.searchExpandRef = createRef(createStubElement());

  editor.openSearch(false);
  assert.equal(editor.searchBarRef.current.classList.contains('is-expanded'), false, '⌘F 打开保持折叠');

  editor.toggleSearchReplaceRow();
  assert.equal(editor.searchBarRef.current.classList.contains('is-expanded'), true);
  assert.equal(editor.searchExpandRef.current.getAttribute('aria-expanded'), 'true');

  editor.toggleSearchReplaceRow();
  assert.equal(editor.searchBarRef.current.classList.contains('is-expanded'), false);

  editor.openSearch(true);
  assert.equal(editor.searchBarRef.current.classList.contains('is-expanded'), true, '带替换打开时展开');
});

test('计数文案：无结果标红、空关键字为空', () => {
  const editor = createEditor('hello');
  editor.searchInputRef.current.value = '找不到';

  editor._updateSearchMatches();

  assert.equal(editor.searchCountRef.current.textContent, '无结果');
  assert.equal(editor.searchBarRef.current.classList.contains('search-no-match'), true);
});

test('跳转匹配按镜像层标记的真实位置滚动，软换行长行不失准', () => {
  // 单个逻辑行软换行成几十个视觉行：按行号估算会得出 y≈0 而不滚动
  const editor = createEditor('x'.repeat(5000) + ' target');
  editor.searchInputRef.current.value = 'target';
  editor.searchOpen = true;
  const mark = { offsetTop: 1000 };
  const layer = {
    innerHTML: '',
    scrollTop: 0,
    scrollLeft: 0,
    querySelector: (selector: string) => (selector.includes('is-current') ? mark : null)
  };
  editor.sourceHighlightRef = createRef(layer);

  editor._updateSearchMatches();

  assert.equal(editor.sourceRef.current.scrollTop, 800, '应滚动到镜像层标记居中（1000 - 400/2）');
  assert.equal(layer.scrollTop, 800, '镜像层滚动同步');
});
