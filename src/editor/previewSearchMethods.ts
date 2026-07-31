// @ts-nocheck
// 预览 / 沉浸式阅读的全文搜索：预览面板内浮动搜索条，
// 高亮用 CSS Custom Highlight API（不改动预览 DOM，与批注高亮零冲突）。
// 匹配算法复用 searchReplaceMethods 的 _searchMatchPositions（大小写不敏感）。
export class PreviewSearchMethods {
  _initPreviewSearch() {
    const input = this.previewSearchInputRef.current;
    if (!input || !input.addEventListener) return;
    input.addEventListener('input', () => this._updatePreviewSearchMatches());
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.shiftKey) this.previewSearchPrev();
      else this.previewSearchNext();
    });
  }


  togglePreviewSearch() {
    if (this.previewSearchOpen) this.closePreviewSearch();
    else this.openPreviewSearch();
  }


  openPreviewSearch() {
    const bar = this.previewSearchBarRef.current;
    const input = this.previewSearchInputRef.current;
    if (!bar || !input) return;
    this.previewSearchOpen = true;
    bar.classList.add('is-open');
    this._updatePreviewSearchMatches();
    input.focus();
    if (input.select) input.select();
  }


  closePreviewSearch() {
    const bar = this.previewSearchBarRef.current;
    if (bar) bar.classList.remove('is-open');
    this.previewSearchOpen = false;
    this._previewSearchRanges = [];
    this._previewSearchIndex = -1;
    this._clearPreviewSearchHighlights();
  }


  // options.keepIndex：预览重渲染后保持当前匹配序号；options.silent：不滚动。
  _updatePreviewSearchMatches(options = {}) {
    const prev = this.previewRef.current;
    const input = this.previewSearchInputRef.current;
    if (!prev || !input) return;
    const query = input.value;
    const positions = query ? this._searchMatchPositions(prev.textContent || '', query, false) : [];
    this._previewSearchRanges = positions.length ? this._previewMatchRanges(prev, positions, query.length) : [];
    if (!this._previewSearchRanges.length) {
      this._previewSearchIndex = -1;
      this._applyPreviewSearchHighlights();
      this._syncPreviewSearchCount(query);
      return;
    }
    const index = options.keepIndex && this._previewSearchIndex >= 0
      ? Math.min(this._previewSearchIndex, this._previewSearchRanges.length - 1)
      : 0;
    this._selectPreviewSearchMatch(index, !options.silent);
  }


  previewSearchNext() {
    const total = this._previewSearchRanges ? this._previewSearchRanges.length : 0;
    if (!total) return;
    this._selectPreviewSearchMatch((this._previewSearchIndex + 1) % total);
  }


  previewSearchPrev() {
    const total = this._previewSearchRanges ? this._previewSearchRanges.length : 0;
    if (!total) return;
    this._selectPreviewSearchMatch((this._previewSearchIndex - 1 + total) % total);
  }


  _selectPreviewSearchMatch(index, scroll = true) {
    this._previewSearchIndex = index;
    this._applyPreviewSearchHighlights();
    this._syncPreviewSearchCount(this.previewSearchInputRef.current.value);
    const range = this._previewSearchRanges[index];
    if (range && scroll) this._scrollToPreviewMatch(range);
  }


  _syncPreviewSearchCount(query) {
    const count = this.previewSearchCountRef.current;
    if (!count) return;
    const total = this._previewSearchRanges ? this._previewSearchRanges.length : 0;
    count.textContent = total ? (this._previewSearchIndex + 1) + '/' + total : (query ? '0/0' : '');
    const bar = this.previewSearchBarRef.current;
    if (bar) bar.classList.toggle('search-no-match', Boolean(query) && !total);
  }


  // 纯文本偏移 → DOM Range：TreeWalker 逐文本节点累积偏移后切出区间。
  _previewMatchRanges(root, positions, length) {
    if (typeof document === 'undefined' || !document.createTreeWalker || !document.createRange) return [];
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    let at = 0;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: at, end: at + node.nodeValue.length });
      at += node.nodeValue.length;
    }
    const ranges = [];
    for (const start of positions) {
      const end = start + length;
      const range = document.createRange();
      let assigned = 0;
      for (const item of nodes) {
        if (item.end <= start || item.start >= end) continue;
        if (start >= item.start && start < item.end) { range.setStart(item.node, start - item.start); assigned |= 1; }
        if (end > item.start && end <= item.end) { range.setEnd(item.node, end - item.start); assigned |= 2; }
      }
      if (assigned === 3) ranges.push(range);
    }
    return ranges;
  }


  _applyPreviewSearchHighlights() {
    if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
    const ranges = this._previewSearchRanges || [];
    if (!ranges.length) {
      this._clearPreviewSearchHighlights();
      return;
    }
    CSS.highlights.set('mojian-search', new Highlight(...ranges));
    const current = ranges[this._previewSearchIndex];
    if (current) CSS.highlights.set('mojian-search-current', new Highlight(current));
    else CSS.highlights.delete('mojian-search-current');
  }


  _clearPreviewSearchHighlights() {
    if (typeof CSS === 'undefined' || !CSS.highlights) return;
    CSS.highlights.delete('mojian-search');
    CSS.highlights.delete('mojian-search-current');
  }


  _scrollToPreviewMatch(range) {
    const prev = this.previewRef.current;
    if (!prev || !range.getBoundingClientRect || !prev.getBoundingClientRect) return;
    const rect = range.getBoundingClientRect();
    const host = prev.getBoundingClientRect();
    if (rect.top < host.top + 60 || rect.bottom > host.bottom - 60) {
      prev.scrollTop += rect.top - host.top - host.height / 2;
    }
  }
}
