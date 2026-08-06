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
      // 镜像高亮层与原文滚动实时对齐
      src.addEventListener('scroll', () => {
        const layer = this.sourceHighlightRef && this.sourceHighlightRef.current;
        if (layer) {
          layer.scrollTop = src.scrollTop;
          layer.scrollLeft = src.scrollLeft;
        }
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
    if (focusReplace) this._setSearchReplaceExpanded(true);
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
    this._renderSourceHighlights();
    const src = this.sourceRef.current;
    if (src) src.focus();
  }

  _syncSearchOptionButton(ref, active) {
    const btn = ref && ref.current;
    if (!btn) return;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }


  toggleSearchCase() {
    this.searchCaseSensitive = !this.searchCaseSensitive;
    this._syncSearchOptionButton(this.searchCaseRef, this.searchCaseSensitive);
    this._updateSearchMatches();
  }


  toggleSearchWord() {
    this.searchWholeWord = !this.searchWholeWord;
    this._syncSearchOptionButton(this.searchWordRef, this.searchWholeWord);
    this._updateSearchMatches();
  }


  toggleSearchRegex() {
    this.searchRegex = !this.searchRegex;
    this._syncSearchOptionButton(this.searchRegexRef, this.searchRegex);
    this._updateSearchMatches();
  }


  // 替换行折叠/展开（VS Code 风格的左侧箭头）
  toggleSearchReplaceRow() {
    this._setSearchReplaceExpanded(!this.searchReplaceExpanded);
  }


  _setSearchReplaceExpanded(expanded) {
    this.searchReplaceExpanded = !!expanded;
    const bar = this.searchBarRef.current;
    if (bar) bar.classList.toggle('is-expanded', this.searchReplaceExpanded);
    const toggle = this.searchExpandRef && this.searchExpandRef.current;
    if (toggle) toggle.setAttribute('aria-expanded', this.searchReplaceExpanded ? 'true' : 'false');
  }


  _buildSearchRegex(query, global) {
    try {
      return new RegExp(query, (global ? 'g' : '') + (this.searchCaseSensitive ? '' : 'i'));
    } catch {
      return null;
    }
  }


  // 全字匹配：匹配边缘是单词字符时，紧邻处不能还是单词字符（CJK 视为边界）。
  _isWholeWordRange(text, start, end) {
    const word = /[A-Za-z0-9_]/;
    if (word.test(text[start] || '') && word.test(text[start - 1] || '')) return false;
    if (word.test(text[end - 1] || '') && word.test(text[end] || '')) return false;
    return true;
  }


  // 返回全部匹配区间 [{start, end}]；匹配之间不重叠。
  // options：caseSensitive / wholeWord / regex；正则无效时置 _searchRegexInvalid。
  _searchMatchRanges(text, query, options = {}) {
    this._searchRegexInvalid = false;
    if (!query) return [];
    const ranges = [];
    if (options.regex) {
      const pattern = this._buildSearchRegex(query, true);
      if (!pattern) {
        this._searchRegexInvalid = true;
        return [];
      }
      let match;
      while ((match = pattern.exec(text))) {
        if (match[0]) ranges.push({ start: match.index, end: match.index + match[0].length });
        else pattern.lastIndex += 1; // 零宽匹配防死循环
        if (ranges.length > 100000) break;
      }
    } else {
      const haystack = options.caseSensitive ? text : text.toLowerCase();
      const needle = options.caseSensitive ? query : query.toLowerCase();
      let at = haystack.indexOf(needle);
      while (at >= 0) {
        ranges.push({ start: at, end: at + needle.length });
        at = haystack.indexOf(needle, at + needle.length);
      }
    }
    if (!options.wholeWord) return ranges;
    return ranges.filter((range) => this._isWholeWordRange(text, range.start, range.end));
  }


  _searchOptions() {
    return {
      caseSensitive: this.searchCaseSensitive,
      wholeWord: this.searchWholeWord,
      regex: this.searchRegex
    };
  }

  // options.silent：只刷新计数，不移动原文选区（编辑原文时用，避免抢走光标）。
  _updateSearchMatches(options = {}) {
    const src = this.sourceRef.current;
    const input = this.searchInputRef.current;
    if (!src || !input) return;
    this._searchMatches = this._searchMatchRanges(src.value, input.value, this._searchOptions());
    if (!this._searchMatches.length) {
      this._searchIndex = -1;
      this._syncSearchCount();
      return;
    }
    const anchor = typeof options.from === 'number' ? options.from : (this._searchAnchor || 0);
    let index = this._searchMatches.findIndex((match) => match.start >= anchor);
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
    if (!src || !this._searchMatches.length) return;
    this._searchIndex = index;
    const match = this._searchMatches[index];
    src.setSelectionRange(match.start, match.end);
    // 先渲染镜像层（标出 is-current），再按标记的真实位置滚动
    this._syncSearchCount();
    this._scrollSourceToMatch(src, match.start);
  }


  // 镜像层与原文排版一致，当前项 mark 的 offsetTop 即精确纵向位置；
  // 镜像层不可用时退回按行号估算（soft wrap 下不准，仅兜底）。
  _scrollSourceToMatch(src, position) {
    const layer = this.sourceHighlightRef && this.sourceHighlightRef.current;
    const mark = layer && layer.querySelector && layer.querySelector('mark.is-current');
    if (mark && typeof mark.offsetTop === 'number' && src.clientHeight) {
      const view = src.clientHeight;
      const top = mark.offsetTop;
      if (top < src.scrollTop + 40 || top > src.scrollTop + view - 60) {
        src.scrollTop = Math.max(0, top - view / 2);
      }
      layer.scrollTop = src.scrollTop;
      layer.scrollLeft = src.scrollLeft;
      return;
    }
    this._scrollSourceToPosition(src, position);
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

  _searchCountText(index, total, query) {
    if (this._searchRegexInvalid) return '表达式无效';
    if (total) return '第 ' + (index + 1) + ' 项，共 ' + total + ' 项';
    return query ? '无结果' : '';
  }


  _syncSearchCount() {
    const count = this.searchCountRef.current;
    const input = this.searchInputRef.current;
    if (!count || !input) return;
    const total = this._searchMatches.length;
    count.textContent = this._searchCountText(this._searchIndex, total, input.value);
    const bar = this.searchBarRef.current;
    if (bar) bar.classList.toggle('search-no-match', Boolean(input.value) && !total);
    this._renderSourceHighlights();
  }

  // 正则模式下替换文本支持 $1 分组引用：对命中的片段重跑一次非全局正则展开。
  _expandReplacement(matchedText, replacement) {
    if (!this.searchRegex) return replacement;
    const pattern = this._buildSearchRegex(this.searchInputRef.current.value, false);
    if (!pattern) return replacement;
    try {
      return matchedText.replace(pattern, replacement);
    } catch {
      return replacement;
    }
  }


  replaceCurrent() {
    const src = this.sourceRef.current;
    const replaceInput = this.replaceInputRef.current;
    if (!src || !replaceInput) return;
    if (!this._requireSearchMatches()) return;
    const index = this._searchIndex >= 0 ? this._searchIndex : 0;
    const match = this._searchMatches[index];
    const replacement = this._expandReplacement(src.value.slice(match.start, match.end), replaceInput.value);
    this._applySearchEdit(
      src,
      src.value.slice(0, match.start) + replacement + src.value.slice(match.end),
      match.start + replacement.length
    );
    this._setStatus('已替换 1 处');
  }

  replaceAll() {
    const src = this.sourceRef.current;
    const input = this.searchInputRef.current;
    const replaceInput = this.replaceInputRef.current;
    if (!src || !input || !replaceInput) return;
    const matches = this._searchMatchRanges(src.value, input.value, this._searchOptions());
    if (!matches.length) return;
    const value = src.value;
    let result = '';
    let last = 0;
    for (const match of matches) {
      result += value.slice(last, match.start)
        + this._expandReplacement(value.slice(match.start, match.end), replaceInput.value);
      last = match.end;
    }
    result += value.slice(last);
    this._applySearchEdit(src, result, 0);
    this._setStatus('已替换 ' + matches.length + ' 处');
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

  // textarea 画不出高亮：在其下方垫一层同字体同排版的镜像层，
  // 匹配处涂 mark（当前项强调色），滚动与原文实时对齐。
  _escapeSourceHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }


  _renderSourceHighlights() {
    const layer = this.sourceHighlightRef && this.sourceHighlightRef.current;
    const src = this.sourceRef.current;
    const input = this.searchInputRef.current;
    if (!layer || !src || !input) return;
    // 字号控件用内联样式改 textarea 字号，镜像层同步同一内联值。
    // 不能拷贝 getComputedStyle 的 font 简写：它把 line-height:1.85 序列化成
    // 29.6px 这类绝对值，Chromium 对两种写法的行框取整相差约 1/128px，
    // 数千行的长文档里逐行累积成整行级的高亮偏移（Electron 桌面端实测）。
    // 其余排版属性两层共用同一份 CSS，天然一致，无需 JS 同步。
    if (layer.style && src.style) layer.style.fontSize = src.style.fontSize || '';
    const query = input.value;
    if (!this.searchOpen || !query || !this._searchMatches || !this._searchMatches.length) {
      layer.innerHTML = '';
      return;
    }
    const value = src.value;
    let html = '';
    let last = 0;
    this._searchMatches.forEach((match, index) => {
      html += this._escapeSourceHtml(value.slice(last, match.start));
      html += '<mark class="source-mark' + (index === this._searchIndex ? ' is-current' : '') + '">'
        + this._escapeSourceHtml(value.slice(match.start, match.end)) + '</mark>';
      last = match.end;
    });
    // 末尾补换行，保证镜像层与 textarea 的内容高度一致
    layer.innerHTML = html + this._escapeSourceHtml(value.slice(last)) + '\n';
    layer.scrollTop = src.scrollTop;
    layer.scrollLeft = src.scrollLeft;
  }


  // 全局快捷键（挂在 window keydown 上）。返回 true 表示已消费该事件。
  _handleSearchShortcut(e) {
    const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && !e.shiftKey && key === 'f') {
      e.preventDefault();
      // 预览 / 沉浸式下源码不可见，⌘F 打开预览搜索
      if (this.previewFullscreen || this.viewMode === 'preview') this.openPreviewSearch();
      else this.openSearch(false);
      return true;
    }
    // Mac 的 ⌘H 被系统隐藏窗口占用，替换用 ⌘⌥F；Windows/Linux 用 Ctrl+H。
    if ((mod && e.altKey && key === 'f') || (e.ctrlKey && !e.metaKey && !e.altKey && key === 'h')) {
      e.preventDefault();
      this.openSearch(true);
      return true;
    }
    // Esc 优先关闭预览搜索（沉浸式下第二次 Esc 才退出沉浸式）
    if (e.key === 'Escape' && this.previewSearchOpen) {
      e.preventDefault();
      this.closePreviewSearch();
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
