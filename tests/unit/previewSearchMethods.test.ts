import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewSearchMethods } from '../../src/editor/previewSearchMethods.ts';
import { SearchReplaceMethods } from '../../src/editor/searchReplaceMethods.ts';
import { createRef, createStubElement } from '../helpers/dom.ts';

function createEditor(text: string, query: string) {
  const editor = Object.create(PreviewSearchMethods.prototype);
  const applied: number[] = [];
  const scrolled: unknown[] = [];
  return Object.assign(editor, {
    previewRef: createRef({ textContent: text }),
    previewSearchInputRef: createRef({ value: query, focus() {}, select() {}, addEventListener() {} }),
    previewSearchCountRef: createRef(createStubElement()),
    previewSearchBarRef: createRef(createStubElement()),
    previewSearchOpen: true,
    applied,
    scrolled,
    // 复用与源码搜索相同的匹配算法（运行时同挂在编辑器原型上）
    _searchMatchRanges: SearchReplaceMethods.prototype._searchMatchRanges,
    // DOM 相关步骤在单测里替换为可断言的替身
    _previewMatchRanges(_root: unknown, ranges: Array<{ start: number }>) {
      return ranges.map((item) => ({ pos: item.start }));
    },
    _applyPreviewSearchHighlights() { applied.push(this._previewSearchIndex); },
    _scrollToPreviewMatch(range: unknown) { scrolled.push(range); }
  });
}

test('预览搜索：计数、循环跳转与匹配定位', () => {
  const editor = createEditor('hello world hello', 'hello');

  editor._updatePreviewSearchMatches();
  assert.equal(editor.previewSearchCountRef.current.textContent, '第 1 项，共 2 项');
  assert.ok(editor.applied.length >= 1, '应用高亮应被调用');
  assert.equal(editor.scrolled.length, 1, '应滚动到当前匹配');

  editor.previewSearchNext();
  assert.equal(editor.previewSearchCountRef.current.textContent, '第 2 项，共 2 项');
  editor.previewSearchNext();
  assert.equal(editor.previewSearchCountRef.current.textContent, '第 1 项，共 2 项', '到末尾后回绕');
  editor.previewSearchPrev();
  assert.equal(editor.previewSearchCountRef.current.textContent, '第 2 项，共 2 项');
});

test('预览搜索：无匹配显示 0/0，空关键字不显示计数', () => {
  const editor = createEditor('hello world', '找不到');
  editor._updatePreviewSearchMatches();
  assert.equal(editor.previewSearchCountRef.current.textContent, '无结果');

  editor.previewSearchInputRef.current.value = '';
  editor._updatePreviewSearchMatches();
  assert.equal(editor.previewSearchCountRef.current.textContent, '');
});

test('关闭预览搜索时清理高亮与状态', () => {
  const editor = createEditor('hello world hello', 'hello');
  let cleared = 0;
  editor._clearPreviewSearchHighlights = () => { cleared += 1; };
  editor._updatePreviewSearchMatches();

  editor.closePreviewSearch();

  assert.equal(editor.previewSearchOpen, false);
  assert.equal(cleared, 1);
  assert.equal(editor.previewSearchBarRef.current.classList.contains('is-open'), false);
});
