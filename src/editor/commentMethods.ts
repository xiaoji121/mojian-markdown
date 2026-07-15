// @ts-nocheck

export class CommentMethods {
  _typeLabel(t) {
    return ({ marker: '马克笔', wavy: '波浪线', straight: '直线', idea: '想法', ai: 'AI 问答' })[t] || '批注';
  }


  _initComments() {
    const prev = this.previewRef.current;
    if (!prev) return;
    prev.addEventListener('mouseup', () => setTimeout(() => this._onPreviewSelect(), 0));
    prev.addEventListener('keyup', () => this._onPreviewSelect());
    document.addEventListener('selectionchange', () => {
      if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
        clearTimeout(this._selectionT);
        this._selectionT = setTimeout(() => this._onPreviewSelect(), 80);
      }
    });
    prev.addEventListener('scroll', () => { if (this.selBarRef.current) this.selBarRef.current.style.display = 'none'; });
    prev.addEventListener('click', (e) => {
      const t = e.target;
      const id = t && t.getAttribute && (t.getAttribute('data-comment-id') || t.getAttribute('data-comment-badge'));
      if (id) this._focusComment(id);
    });
    document.addEventListener('mousedown', (e) => {
      const b = this.selBarRef.current;
      if (b && !b.contains(e.target) && !prev.contains(e.target)) b.style.display = 'none';
    });
  }


  _offsetOf(root, node, off) {
    try {
      const r = document.createRange();
      r.setStart(root, 0); r.setEnd(node, off);
      return r.toString().length;
    } catch (e) { return -1; }
  }


  _onPreviewSelect() {
    const prev = this.previewRef.current, bar = this.selBarRef.current;
    if (!prev || !bar) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { bar.style.display = 'none'; return; }
    const range = sel.getRangeAt(0);
    if (!prev.contains(range.commonAncestorContainer)) { bar.style.display = 'none'; return; }
    const quote = sel.toString().replace(/\s+$/, '');
    if (!quote.trim()) { bar.style.display = 'none'; return; }
    const full = prev.textContent;
    const startOff = this._offsetOf(prev, range.startContainer, range.startOffset);
    let occ = 0, from = 0;
    while (true) { const f = full.indexOf(quote, from); if (f < 0) break; if (f === startOff) break; occ++; from = f + 1; }
    this._pending = { quote: quote, occ: occ, start: startOff };
    const rect = range.getBoundingClientRect();
    bar.style.display = 'flex';
    const w = bar.offsetWidth, h = bar.offsetHeight;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    let top = rect.top - h - 10;
    if (top < 8) top = rect.bottom + 10;
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }


  _nthIndex(s, sub, n) {
    if (!sub) return -1;
    let from = 0, idx = -1;
    for (let k = 0; k <= n; k++) { idx = s.indexOf(sub, from); if (idx < 0) return -1; from = idx + 1; }
    return idx;
  }


  _quoteRange(full, c) {
    if (!full || !c || !c.quote) return null;
    if (typeof c.start === 'number' && c.start >= 0) {
      if (full.slice(c.start, c.start + c.quote.length) === c.quote) {
        return { start: c.start, end: c.start + c.quote.length };
      }
    }
    const exact = this._nthIndex(full, c.quote, c.occ || 0);
    if (exact >= 0) return { start: exact, end: exact + c.quote.length };

    const pieces = c.quote.trim().split(/\s+/).filter(Boolean);
    if (!pieces.length) return null;
    const escaped = pieces.map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    try {
      const match = new RegExp(escaped.join('\\s+')).exec(full);
      if (match) return { start: match.index, end: match.index + match[0].length };
    } catch (e) {}
    return null;
  }


  _wrapRange(root, start, end, c) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const items = [];
    let n, pos = 0;
    while ((n = walker.nextNode())) { const len = n.nodeValue.length; items.push({ node: n, start: pos, end: pos + len }); pos += len; }
    let css = 'cursor:pointer; border-radius:2px;';
    if (c.type === 'wavy') css = 'cursor:pointer; text-decoration:underline; text-decoration-style:wavy; text-decoration-color:var(--accent); text-decoration-thickness:1.5px; text-underline-offset:3px;';
    else if (c.type === 'straight') css = 'cursor:pointer; text-decoration:underline; text-decoration-style:solid; text-decoration-color:var(--accent); text-decoration-thickness:1.5px; text-underline-offset:3px;';
    else css = 'cursor:pointer; border-radius:2px; background:var(--mark-bg);';
    let first = null;
    for (const it of items) {
      if (it.end <= start || it.start >= end) continue;
      if (!this._canWrapHighlightNode(it.node)) continue;
      let node = it.node;
      const a = Math.max(start, it.start) - it.start;
      const b = Math.min(end, it.end) - it.start;
      if (a > 0) node = node.splitText(a);
      if (b - a < node.nodeValue.length) node.splitText(b - a);
      const span = document.createElement('span');
      span.setAttribute('data-comment-id', c.id);
      span.style.cssText = css;
      span.title = '查看批注';
      node.parentNode.insertBefore(span, node);
      span.appendChild(node);
      if (!first) first = span;
    }
    return first;
  }

  _canWrapHighlightNode(node) {
    const parent = node && node.parentNode;
    if (!parent || parent.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = parent.tagName;
    if (['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'COLGROUP'].includes(tag)) return false;
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    return true;
  }


  _addBadge(span, id, num) {
    if (!span) return;
    const badge = document.createElement('sup');
    badge.setAttribute('data-comment-badge', id);
    badge.textContent = num;
    badge.style.cssText = 'display:inline-block; min-width:14px; height:14px; line-height:14px; text-align:center; font-family:var(--mono); font-size:var(--fs-2xs); font-weight:700; color:var(--accent-ink); background:var(--accent); border-radius:var(--radius-pill); padding:0 3px; margin:0 1px 0 2px; vertical-align:super; cursor:pointer; user-select:none;';
    span.parentNode.insertBefore(badge, span.nextSibling);
  }


  _applyHighlights() {
    const prev = this.previewRef.current;
    if (!prev || !this.comments || !this.comments.length) return;
    const full = prev.textContent;
    const placed = [];
    for (const c of this.comments) {
      const range = this._quoteRange(full, c);
      placed.push(range ? this._wrapRange(prev, range.start, range.end, c) : null);
    }
    placed.forEach((span, i) => {
      const c = this.comments[i];
      if (span && (c.type === 'idea' || (c.note && c.note.trim()))) this._addBadge(span, c.id, i + 1);
    });
  }


  _createAnnotation(type, focusNote) {
    const p = this._pending;
    if (!p || !p.quote) return null;
    const c = { id: 'c' + Date.now() + Math.floor(Math.random() * 999), quote: p.quote, occ: p.occ || 0, start: p.start, type: type, note: '', ts: Date.now() };
    this.comments.push(c);
    this._pending = null;
    const sel = window.getSelection(); if (sel) sel.removeAllRanges();
    if (this.selBarRef.current) this.selBarRef.current.style.display = 'none';
    this._persist();
    this._renderPreview();
    this._renderComments();
    if (focusNote) { this._openPanel(true); this._focusComment(c.id, true); }
    return c;
  }


  copySel() {
    const p = this._pending; if (!p) return;
    this._copy(p.quote, '已复制选中文字');
    const s = window.getSelection(); if (s) s.removeAllRanges();
    if (this.selBarRef.current) this.selBarRef.current.style.display = 'none';
  }


  markMarker() { if (this._createAnnotation('marker', false)) this._setStatus('✓ 已用马克笔划线 · 共 ' + this.comments.length + ' 条'); }

  markWavy() { if (this._createAnnotation('wavy', false)) this._setStatus('✓ 已添加波浪线 · 共 ' + this.comments.length + ' 条'); }

  markStraight() { if (this._createAnnotation('straight', false)) this._setStatus('✓ 已添加直线 · 共 ' + this.comments.length + ' 条'); }

  writeIdea() { if (this._createAnnotation('idea', true)) this._setStatus('写下你对这段的想法…'); }


  async _deleteComment(id) {
    const comment = this.comments.find((c) => c.id === id);
    this.comments = this.comments.filter((c) => c.id !== id);
    this._persist();
    this._renderPreview();
    this._renderComments();
    this._setStatus('已删除批注 · 剩 ' + this.comments.length + ' 条');
    if (this.agentBridgeEnabled && comment && this.bridgeDocumentId && (comment.requestId || comment.id)) {
      try {
        const annotationId = comment.requestId || comment.id;
        const response = await fetch(
          'http://127.0.0.1:4317/api/documents/' + encodeURIComponent(this.bridgeDocumentId) +
          '/annotations/' + encodeURIComponent(annotationId),
          { method: 'DELETE' }
        );
        if (!response.ok) throw new Error('删除同步失败');
        this._refreshRecentDocuments();
      } catch (error) {
        this._setStatus('批注已在当前页面删除，但同步到 Reading Workspace 失败');
      }
    }
  }


  _openPanel(show) {
    const aside = this.commentsRef.current;
    if (!aside) return;
    this.panelOpen = (show === undefined || show === null) ? !this.panelOpen : show;
    aside.style.display = this.panelOpen ? 'flex' : 'none';
    if (this.panelOpen && this.splitRef.current) {
      this.splitRef.current.style.setProperty('--active-side-panel-width', '340px');
    }
    if (this.panelOpen && this.aiPanelOpen) {
      this.aiPanelOpen = false;
      if (this.aiPanelRef.current) this.aiPanelRef.current.style.display = 'none';
    }
    if (this.panelOpen) requestAnimationFrame(() => this._resizeCommentTextareas());
    this._syncFullscreenLayout();
  }


  _syncFullscreenLayout() {
    const split = this.splitRef.current;
    if (!split) return;
    split.classList.toggle('preview-fullscreen-active', this.previewFullscreen);
    split.classList.toggle('fullscreen-comments-open', this.previewFullscreen && (this.panelOpen || this.aiPanelOpen));
  }


  _focusComment(id, focusInput) {
    this._openPanel(true);
    const prev = this.previewRef.current;
    const span = prev && prev.querySelector('[data-comment-id="' + id + '"]');
    if (span) { this._scrollPreviewTo(span); this._flashEl(span); }
    const list = this.commentListRef.current;
    const card = list && list.querySelector('[data-card-id="' + id + '"]');
    if (card) {
      list.scrollTo({ top: Math.max(0, card.offsetTop - 12), behavior: 'smooth' });
      this._flashEl(card);
      if (focusInput) { const ta = card.querySelector('textarea'); if (ta) setTimeout(() => ta.focus(), 80); }
    }
  }


  _renderComments() {
    const list = this.commentListRef.current;
    if (this.commentCountRef.current) this.commentCountRef.current.textContent = this.comments.length;
    if (this.previewCommentCountRef.current) this.previewCommentCountRef.current.textContent = this.comments.length;
    if (!list) return;
    list.innerHTML = '';
    if (!this.comments.length) {
      const e = document.createElement('div');
      e.style.cssText = 'padding:26px 12px; color:var(--text-4); font-size:var(--fs-sm); line-height:1.9; text-align:center; font-family:var(--sans);';
      e.innerHTML = '在右侧预览中<span style="color:var(--text-3)">选中任意文字</span>，<br>用浮出的工具条<span style="color:var(--accent)">划线</span>或<span style="color:var(--accent)">写想法</span>，<br>都会收集到这里。';
      list.appendChild(e);
      return;
    }
    this.comments.forEach((c, i) => list.appendChild(this._commentCard(c, i)));
    requestAnimationFrame(() => this._resizeCommentTextareas());
  }

  _resizeCommentTextareas() {
    const list = this.commentListRef.current;
    if (!list) return;
    list.querySelectorAll('.comment-note-input').forEach((ta) => {
      ta.style.height = 'auto';
      ta.style.height = Math.max(42, ta.scrollHeight) + 'px';
    });
  }


  _commentCard(c, i) {
    const card = document.createElement('div');
    card.setAttribute('data-card-id', c.id);
    card.className = 'comment-card';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border-bottom:1px solid var(--border-faint);';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex; align-items:center; gap:7px;';
    const num = document.createElement('span');
    num.textContent = (i + 1);
    num.style.cssText = 'display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; background:var(--accent); color:var(--accent-ink); border-radius:var(--radius-pill); font-family:var(--mono); font-size:var(--fs-xs); font-weight:700;';
    const tag = document.createElement('span');
    tag.textContent = this._typeLabel(c.type);
    tag.style.cssText = 'font-family:var(--mono); font-size:var(--fs-2xs); letter-spacing:0.06em; padding:2px 7px; border-radius:var(--radius-pill); background:var(--accent-soft); color:var(--accent); border:1px solid var(--border-soft);';
    left.appendChild(num); left.appendChild(tag);

    const acts = document.createElement('div');
    acts.style.cssText = 'display:flex; gap:6px;';
    const btnCss = 'background:transparent; border:1px solid var(--border); color:var(--text-3); padding:4px 9px; font-family:var(--mono); font-size:var(--fs-2xs); cursor:pointer; border-radius:var(--radius-control); transition:all .15s;';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '复制'; copyBtn.className = 'tbtn'; copyBtn.style.cssText = btnCss;
    copyBtn.addEventListener('click', () => this._copy(this._commentText(c, i), '已复制该批注'));
    const delBtn = document.createElement('button');
    delBtn.textContent = '删除'; delBtn.className = 'tbtn'; delBtn.style.cssText = btnCss;
    delBtn.addEventListener('click', () => this._deleteComment(c.id));
    acts.appendChild(copyBtn);
    if (c.type === 'ai') {
      const viewBtn = document.createElement('button');
      viewBtn.textContent = c.aiStatus === 'pending' ? '回答中' : '查看问答';
      viewBtn.className = 'tbtn';
      viewBtn.style.cssText = btnCss;
      viewBtn.disabled = c.aiStatus === 'pending';
      viewBtn.addEventListener('click', () => this._openAIFromComment(c));
      acts.appendChild(viewBtn);
    }
    acts.appendChild(delBtn);
    head.appendChild(left); head.appendChild(acts);

    const quote = document.createElement('div');
    quote.className = 'comment-quote';
    quote.textContent = c.quote;
    quote.title = '跳到原文位置';
    quote.addEventListener('click', () => this._focusComment(c.id));

    card.appendChild(head);
    card.appendChild(quote);
    if (c.type === 'ai') {
      const qa = document.createElement('div');
      qa.className = 'comment-ai-qa';
      const question = document.createElement('div');
      question.className = 'comment-ai-question';
      question.textContent = '问：' + (c.question || c.note || '');
      const answer = document.createElement('div');
      answer.className = 'comment-ai-answer';
      answer.textContent = c.aiStatus === 'pending'
        ? 'Claude 正在回答…'
        : '答：' + (c.answer || '回答暂不可用');
      qa.appendChild(question);
      qa.appendChild(answer);
      card.appendChild(qa);
    } else {
      const ta = document.createElement('textarea');
      ta.className = 'comment-note-input';
      ta.value = c.note || '';
      ta.placeholder = c.type === 'idea' ? '写下你的疑问或想法…' : '可补充想法（可选）…';
      ta.spellcheck = false;
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(42, ta.scrollHeight) + 'px'; };
      ta.addEventListener('focus', () => { ta.style.borderColor = 'var(--text-4)'; });
      ta.addEventListener('blur', () => { ta.style.borderColor = 'var(--border-soft)'; });
      ta.addEventListener('input', () => { c.note = ta.value; grow(); this._persist(); this._refreshBadges(); });
      setTimeout(grow, 0);
      card.appendChild(ta);
    }
    return card;
  }


  _openAIFromComment(c) {
    if (!this.agentBridgeEnabled) return;
    this._openAIPanel(true);
    if (c.documentId) this._loadAIConversation(c.documentId, c.requestId);
  }


  _refreshBadges() {
    if (this._badgeT) clearTimeout(this._badgeT);
    this._badgeT = setTimeout(() => this._renderPreview(), 400);
  }


  _commentText(c, i) {
    const n = (typeof i === 'number') ? (i + 1) : (this.comments.indexOf(c) + 1);
    let s = '【' + n + ' · ' + this._typeLabel(c.type) + '】\n原文：「' + c.quote + '」';
    if (c.type === 'ai') {
      s += '\n问题：' + (c.question || c.note || '');
      if (c.answer) s += '\n回答：' + c.answer;
    } else if (c.note && c.note.trim()) s += '\n我的想法：' + c.note;
    return s;
  }


  _allCommentsText() {
    const head = '《' + this.fileName + '》批注汇总（共 ' + this.comments.length + ' 条）\n';
    return head + '\n' + this.comments.map((c, i) => this._commentText(c, i)).join('\n\n');
  }


  _fullWithComments() {
    const src = this.sourceRef.current ? this.sourceRef.current.value : '';
    let out = '# 原文：' + this.fileName + '\n\n' + src;
    if (this.comments.length) {
      out += '\n\n---\n\n## 我的批注（共 ' + this.comments.length + ' 条）\n\n';
      out += this.comments.map((c, i) => {
        let line = '**【' + (i + 1) + ' · ' + this._typeLabel(c.type) + '】** 针对原文：「' + c.quote + '」';
        if (c.type === 'ai') {
          line += '\n\n**问题：** ' + (c.question || c.note || '');
          if (c.answer) line += '\n\n**回答：**\n\n' + c.answer;
        } else if (c.note && c.note.trim()) line += '\n\n> ' + c.note;
        return line;
      }).join('\n\n');
    }
    return out;
  }


  _copy(text, msg) {
    const done = () => this._setStatus('✓ ' + (msg || '已复制'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this._copyFallback(text, done));
    } else this._copyFallback(text, done);
  }


  _copyFallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed; top:0; left:0; opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (done) done();
  }


  copyAll() {
    if (!this.comments.length) { this._openPanel(true); this._setStatus('暂无批注可复制'); return; }
    this._copy(this._allCommentsText(), '已复制全部批注（' + this.comments.length + ' 条）');
  }


  copyFull() { this._copy(this._fullWithComments(), '已复制全文 + 批注'); }

  // ===== source toolbar formatting =====
}
