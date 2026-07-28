// @ts-nocheck

// Markdown 原文的全文搜索与替换：浮层搜索条、匹配跳转、替换当前/全部。
// 替换走与工具栏格式化相同的撤销历史链路（_recordEditingHistory 强制新条目）。
export class SearchReplaceMethods {
  _initSearchBar() {
    const input = this.searchInputRef.current;
    const replace = this.replaceInputRef.current;
    const src = this.sourceRef.current;
    if (src) {
      // 编辑原文时仅刷新计数，不抢走光标。
      src.addEventListener('input', () => {
        if (this.searchOpen) this._updateSearchMatches({ silent: true });
      });
    }
    if (input) {
      input.addEventListener('input', () => this._updateSearchMatches());
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (e.shiftKey) this.searchPrev();
        else this.searchNext();
      });
    }
    if (replace) {
      replace.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        this.replaceCurrent();
      });
    }
  }

  toggleSearch() {
    if (this.searchOpen) this.closeSearch();
    else this.openSearch();
  }

  openSearch(focusReplace = false) {
    const bar = this.searchBarRef.current;
    const src = this.sourceRef.current;
    const input = this.searchInputRef.current;
    if (!bar || !src || !input) return;
    // 预览模式下源码区不可见，先回到分屏再搜索。
    if (this.viewMode === 'preview' && typeof this.setViewMode === 'function') {
      this.setViewMode('split');
    }
    this.searchOpen = true;
    bar.classList.add('is-open');
    const selection = src.value.slice(src.selectionStart, src.selectionEnd);
    if (selection && !selection.includes('\n')) input.value = selection;
    this._searchAnchor = src.selectionStart;
    this._updateSearchMatches();
    const target = focusReplace && this.replaceInputRef.current ? this.replaceInputRef.current : input;
    target.focus();
    if (target.select) target.select();
  }

  closeSearch() {
    const bar = this.searchBarRef.current;
    if (bar) bar.classList.remove('is-open');
    this.searchOpen = false;
    this._searchMatches = [];
    this._searchIndex = -1;
    const src = this.sourceRef.current;
    if (src) src.focus();
  }

  toggleSearchCase() {
    this.searchCaseSensitive = !this.searchCaseSensitive;
    const btn = this.searchCaseRef.current;
    if (btn) {
      btn.classList.toggle('is-active', this.searchCaseSensitive);
      btn.setAttribute('aria-pressed', this.searchCaseSensitive ? 'true' : 'false');
    }
    this._updateSearchMatches();
  }

  // 字面量匹配（无正则语义），返回全部起始位置；匹配之间不重叠。
  _searchMatchPositions(text, query, caseSensitive) {
    if (!query) return [];
    const haystack = caseSensitive ? text : text.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const positions = [];
    let at = haystack.indexOf(needle);
    while (at >= 0) {
      positions.push(at);
      at = haystack.indexOf(needle, at + needle.length);
    }
    return positions;
  }

  // options.silent：只刷新计数，不移动原文选区（编辑原文时用，避免抢走光标）。
  _updateSearchMatches(options = {}) {
    const src = this.sourceRef.current;
    const input = this.searchInputRef.current;
    if (!src || !input) return;
    this._searchMatches = this._searchMatchPositions(src.value, input.value, this.searchCaseSensitive);
    if (!this._searchMatches.length) {
      this._searchIndex = -1;
      this._syncSearchCount();
      return;
    }
    const anchor = typeof options.from === 'number' ? options.from : (this._searchAnchor || 0);
    let index = this._searchMatches.findIndex((pos) => pos >= anchor);
    if (index < 0) index = 0;
    this._searchIndex = Math.min(index, this._searchMatches.length - 1);
    if (options.silent) this._syncSearchCount();
    else this._selectSearchMatch(this._searchIndex);
  }

  searchNext() {
    if (!this._requireSearchMatches()) return;
    this._selectSearchMatch((this._searchIndex + 1) % this._searchMatches.length);
  }

  searchPrev() {
    if (!this._requireSearchMatches()) return;
    const total = this._searchMatches.length;
    this._selectSearchMatch((this._searchIndex - 1 + total) % total);
  }

  _requireSearchMatches() {
    if (!this._searchMatches.length) this._updateSearchMatches();
    return this._searchMatches.length > 0;
  }

  _selectSearchMatch(index) {
    const src = this.sourceRef.current;
    const input = this.searchInputRef.current;
    if (!src || !input || !this._searchMatches.length) return;
    this._searchIndex = index;
    const start = this._searchMatches[index];
    src.setSelectionRange(start, start + input.value.length);
    this._scrollSourceToPosition(src, start);
    this._syncSearchCount();
  }

  // textarea 无法滚动到任意 selection，按行号近似定位（soft wrap 下为估算）。
  _scrollSourceToPosition(src, position) {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(src) : null;
    const lineHeight = (style && parseFloat(style.lineHeight)) || 26;
    const line = src.value.slice(0, position).split('\n').length - 1;
    const y = line * lineHeight;
    const view = src.clientHeight || 0;
    if (y < src.scrollTop || y > src.scrollTop + view - lineHeight * 2) {
      src.scrollTop = Math.max(0, y - view / 2);
    }
  }

  _syncSearchCount() {
    const count = this.searchCountRef.current;
    const input = this.searchInputRef.current;
    if (!count || !input) return;
    const total = this._searchMatches.length;
    count.textContent = total ? (this._searchIndex + 1) + '/' + total : (input.value ? '0/0' : '');
    const bar = this.searchBarRef.current;
    if (bar) bar.classList.toggle('search-no-match', Boolean(input.value) && !total);
  }

  replaceCurrent() {
    const src = this.sourceRef.current;
    const input = this.searchInputRef.current;
    const replaceInput = this.replaceInputRef.current;
    if (!src || !input || !replaceInput) return;
    if (!this._requireSearchMatches()) return;
    const index = this._searchIndex >= 0 ? this._searchIndex : 0;
    const start = this._searchMatches[index];
    const replacement = replaceInput.value;
    this._applySearchEdit(
      src,
      src.value.slice(0, start) + replacement + src.value.slice(start + input.value.length),
      start + replacement.length
    );
    this._setStatus('已替换 1 处');
  }

  replaceAll() {
    const src = this.sourceRef.current;
    const input = this.searchInputRef.current;
    const replaceInput = this.replaceInputRef.current;
    if (!src || !input || !replaceInput) return;
    const positions = this._searchMatchPositions(src.value, input.value, this.searchCaseSensitive);
    if (!positions.length) return;
    const value = src.value;
    const replacement = replaceInput.value;
    let result = '';
    let last = 0;
    for (const start of positions) {
      result += value.slice(last, start) + replacement;
      last = start + input.value.length;
    }
    result += value.slice(last);
    this._applySearchEdit(src, result, 0);
    this._setStatus('已替换 ' + positions.length + ' 处');
  }

  // 替换共用的落盘链路：写入新值、记独立历史、重渲染、标脏，并定位后续匹配。
  _applySearchEdit(src, nextValue, nextAnchor) {
    this._syncCurrentEditingState();
    const scrollTop = src.scrollTop;
    const scrollLeft = src.scrollLeft;
    src.value = nextValue;
    src.scrollTop = scrollTop;
    src.scrollLeft = scrollLeft;
    this._searchAnchor = nextAnchor;
    this._updateSearchMatches({ from: nextAnchor });
    if (!this._searchMatches.length) src.setSelectionRange(nextAnchor, nextAnchor);
    this._recordEditingHistory('', true);
    this._renderPreview();
    this._touch();
  }

  // 全局快捷键（挂在 window keydown 上）。返回 true 表示已消费该事件。
  _handleSearchShortcut(e) {
    const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && !e.shiftKey && key === 'f') {
      e.preventDefault();
      this.openSearch(false);
      return true;
    }
    // Mac 的 ⌘H 被系统隐藏窗口占用，替换用 ⌘⌥F；Windows/Linux 用 Ctrl+H。
    if ((mod && e.altKey && key === 'f') || (e.ctrlKey && !e.metaKey && !e.altKey && key === 'h')) {
      e.preventDefault();
      this.openSearch(true);
      return true;
    }
    if (e.key === 'Escape' && this.searchOpen && !this.previewFullscreen) {
      e.preventDefault();
      this.closeSearch();
      return true;
    }
    return false;
  }
}
