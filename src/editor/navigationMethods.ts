// @ts-nocheck

export class NavigationMethods {
  _norm(s) {
    return (s || '').toLowerCase()
      .replace(/[#*`>~_\[\]()|\-=+!.:,。，、；;？?！…—'"“”‘’]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }


  _onSourceDbl() {
    const src = this.sourceRef.current, prev = this.previewRef.current;
    if (!src || !prev) return;
    const val = src.value, pos = src.selectionStart;
    const ls = val.lastIndexOf('\n', pos - 1) + 1;
    let le = val.indexOf('\n', pos); if (le < 0) le = val.length;
    const line = val.slice(ls, le);
    const word = val.slice(src.selectionStart, src.selectionEnd);
    const target = this._findBlock(line, word);
    if (target) { this._scrollPreviewTo(target); this._flashEl(target); }
  }


  _onPreviewDbl(e) {
    const src = this.sourceRef.current, prev = this.previewRef.current;
    if (!src || !prev) return;
    let node = e.target;
    while (node && node.parentNode !== prev) node = node.parentNode;
    if (!node || node === prev) return;
    const word = (window.getSelection && window.getSelection().toString()) || '';
    const idx = this._findSourceLine(node.textContent, word);
    if (idx >= 0) this._scrollSourceToLine(idx);
  }


  _findBlock(line, word) {
    const prev = this.previewRef.current;
    const blocks = Array.from(prev.children);
    const nLine = this._norm(line), nWord = this._norm(word);
    let best = null, bestScore = 0;
    for (const b of blocks) {
      const nb = this._norm(b.textContent);
      if (!nb) continue;
      let score = 0;
      if (nLine && (nb.includes(nLine) || nLine.includes(nb))) score = Math.min(nb.length, nLine.length) + 2;
      else if (nWord && nb.includes(nWord)) score = nWord.length * 0.5;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    return bestScore > 1 ? best : null;
  }


  _findSourceLine(blockText, word) {
    const src = this.sourceRef.current;
    const lines = src.value.split('\n');
    const nb = this._norm(blockText), nWord = this._norm(word);
    let best = -1, bestScore = 0;
    lines.forEach((ln, i) => {
      const nl = this._norm(ln);
      if (!nl) return;
      let score = 0;
      if (nb && (nb.includes(nl) || nl.includes(nb))) score = Math.min(nl.length, nb.length) + 2;
      else if (nWord && nl.includes(nWord)) score = nWord.length * 0.5;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return bestScore > 1 ? best : -1;
  }


  _scrollPreviewTo(el) {
    const prev = this.previewRef.current;
    const cr = prev.getBoundingClientRect(), er = el.getBoundingClientRect();
    const top = prev.scrollTop + (er.top - cr.top) - prev.clientHeight * 0.3;
    prev.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }


  _scrollSourceToLine(idx) {
    const src = this.sourceRef.current;
    const lines = src.value.split('\n');
    let start = 0;
    for (let i = 0; i < idx; i++) start += lines[i].length + 1;
    const end = start + lines[idx].length;
    src.focus();
    try { src.setSelectionRange(start, end); } catch (e) {}
    const cs = getComputedStyle(src);
    let lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = this.fontSize * 1.85;
    const padTop = parseFloat(cs.paddingTop) || 0;
    src.scrollTop = Math.max(0, idx * lh - src.clientHeight * 0.35 + padTop);
  }


  _flashEl(el) {
    if (!el) return;
    const old = el.style.background, oldT = el.style.transition;
    el.style.transition = 'background .15s ease';
    el.style.background = 'var(--accent-soft)';
    el.style.borderRadius = el.style.borderRadius || '3px';
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { el.style.background = old; el.style.transition = oldT; }, 750);
  }

  // ===== annotations =====
}
