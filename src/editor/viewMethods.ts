// @ts-nocheck

function localImageSource(src) {
  if (!src || /^(data:|blob:|file:)/i.test(src)) return '';
  if (!/^https?:/i.test(src)) return src;
  try {
    const url = new URL(src);
    const localHost = url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '::1';
    return localHost ? decodeURIComponent(url.pathname).replace(/^\/+/, '') : '';
  } catch {
    return '';
  }
}

export class ViewMethods {
  _syncViewMode() {
    const split = this.splitRef.current;
    if (!split) return;
    split.classList.toggle('editor-mode-active', this.viewMode === 'editor');
    split.classList.toggle('preview-mode-active', this.viewMode === 'preview');
    this._syncReadingToolbarScroll?.();
    const switcher = this.viewModeSwitcherRef.current;
    if (!switcher) return;
    switcher.querySelectorAll('[data-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.mode === this.viewMode ? 'true' : 'false');
    });
  }


  setViewMode(mode) {
    if (!['editor', 'split', 'preview'].includes(mode)) return;
    if (mode === 'editor' && this.appearanceOpen) this.toggleReadingAppearance(false);
    this.viewMode = mode;
    if (mode !== 'preview' && this.previewOverrideMarkdown) {
      this.previewOverrideMarkdown = '';
      this.activeAnswerRequestId = null;
      this._renderRecentDocuments();
    }
    if (mode !== 'editor') this._renderPreview();
    this._syncViewMode();
    if (mode !== 'preview') {
      setTimeout(() => this.sourceRef.current && this.sourceRef.current.focus(), 0);
    }
  }

  // ===== theme =====

  _applyTheme() {
    try { document.body.setAttribute('data-theme', this.theme); } catch (e) {}
    if (this.themeIconRef.current) this.themeIconRef.current.innerHTML = this.theme === 'dark'
      ? '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/></svg>'
      : '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
    if (this.themeLabelRef?.current) this.themeLabelRef.current.textContent = this.theme === 'dark' ? '暗色' : '亮色';
    this._applyPaper();
  }


  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this._themeTouched = true;
    this._applyTheme();
    this._persist();
    this._setStatus('已切换为' + (this.theme === 'dark' ? '暗黑' : '亮色') + '模式');
  }

  // ===== paper（内容纸色，与框架主题解耦） =====

  PAPERS() {
    return [
      { id: 'ink', label: '墨黑', swatch: 'var(--editor-ink, #1c1a17)' },
      { id: 'parchment', label: '羊皮纸', swatch: '#f9ebcc' },
      { id: 'cream', label: '米黄', swatch: '#f0e9d1' },
      { id: 'snow', label: '清爽白', swatch: '#ffffff' },
      { id: 'green', label: '豆沙绿', swatch: '#c0edc6' }
    ];
  }

  _resolvedPaper() {
    // 纸色按主题分别记忆；未选择时暗→墨黑、亮→清爽白
    const pref = this.theme === 'light' ? this.paperLight : this.paperDark;
    return pref || (this.theme === 'light' ? 'snow' : 'ink');
  }

  _applyPaper() {
    const active = this._resolvedPaper();
    try { document.body.setAttribute('data-paper', active); } catch (e) {}
    const picker = this.paperPickerRef.current;
    if (!picker) return;
    picker.querySelectorAll('.paper-dot').forEach((dot) => {
      const on = dot.dataset.paper === active;
      dot.classList.toggle('is-active', on);
      dot.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  setPaper(id) {
    if (this.theme === 'light') this.paperLight = id;
    else this.paperDark = id;
    this._applyPaper();
    this._persist();
    const item = this.PAPERS().find((p) => p.id === id);
    this._setStatus('纸色已切换为「' + (item ? item.label : id) + '」');
  }

  _buildPaperPicker() {
    const picker = this.paperPickerRef.current;
    if (!picker) return;
    picker.innerHTML = '';
    this.PAPERS().forEach((p) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'paper-dot';
      dot.dataset.paper = p.id;
      dot.title = '纸色：' + p.label;
      dot.setAttribute('aria-label', '纸色：' + p.label);
      dot.style.background = p.swatch;
      dot.addEventListener('click', () => this.setPaper(p.id));
      picker.appendChild(dot);
    });
    this._applyPaper();
  }

  // 阅读排版：共享原有纸色、字号和沉浸宽度设置。
  _initReadingAppearanceRefs(React) {
    this.paperPickerRef = React.createRef();
    this.appearancePanelRef = React.createRef();
    this.appearanceButtonRef = React.createRef();
  }

  _readingAppearanceRenderVals() {
    return {
      appearancePanelRef: this.appearancePanelRef,
      appearanceButtonRef: this.appearanceButtonRef,
      toggleReadingAppearance: () => this.toggleReadingAppearance()
    };
  }

  _initReadingAppearance() {
    if (this.appearancePanelRef.current) this.appearancePanelRef.current.hidden = true;
    this._appearanceOutsideH = (event) => {
      const panel = this.appearancePanelRef.current, button = this.appearanceButtonRef.current;
      if (!this.appearanceOpen || panel?.contains(event.target) || button?.contains(event.target)) return;
      this.toggleReadingAppearance(false);
    };
    this._appearanceFocusH = this._appearanceOutsideH;
    document.addEventListener('pointerdown', this._appearanceOutsideH);
    document.addEventListener('focusin', this._appearanceFocusH);
  }

  toggleReadingAppearance(force, returnFocus = false) {
    const panel = this.appearancePanelRef.current, button = this.appearanceButtonRef.current;
    if (!panel || !button) return;
    this.appearanceOpen = typeof force === 'boolean' ? force : !this.appearanceOpen;
    panel.hidden = !this.appearanceOpen;
    button.setAttribute('aria-expanded', String(this.appearanceOpen));
    if (returnFocus) button.focus();
    this._syncReadingToolbarScroll();
  }

  _disposeReadingAppearance() {
    document.removeEventListener('pointerdown', this._appearanceOutsideH);
    document.removeEventListener('focusin', this._appearanceFocusH);
  }

  togglePreviewFullscreen(force) {
    const pane = this.previewPaneRef.current;
    if (!pane) return;
    const next = typeof force === 'boolean' ? force : !this.previewFullscreen;
    this.previewFullscreen = next;
    this._syncPreviewEditable();
    pane.classList.toggle('preview-pane-fullscreen', this.previewFullscreen);
    pane.classList.toggle('immersive-wide', this.previewFullscreen && this.immersiveWide);
    this._syncFullscreenLayout();
    document.body.style.overflow = this.previewFullscreen ? 'hidden' : '';
    this._syncReadingToolbarScroll();
    if (this.fullscreenLabelRef.current) {
      this.fullscreenLabelRef.current.textContent = this.previewFullscreen ? '退出专注' : '专注';
    }
    if (this.fullscreenIconRef.current) {
      this.fullscreenIconRef.current.innerHTML = this.previewFullscreen
        ? '<path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"></path>'
        : '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path>';
    }
    this._setStatus(this.previewFullscreen ? '已进入沉浸式阅读 · 按 Esc 退出' : '已退出沉浸式阅读');
  }

  _syncPreviewEditable() {
    const prev = this.previewRef.current;
    if (!prev) return;
    prev.setAttribute('contenteditable', 'false');
    if (this.previewTitleRef.current) {
      this.previewTitleRef.current.textContent = '预览 · 仅阅读';
    }
  }

  // ===== 沉浸式：宽屏切换与工具条自动隐藏 =====

  toggleImmersiveWide() {
    this.immersiveWide = !this.immersiveWide;
    const pane = this.previewPaneRef.current;
    if (pane) pane.classList.toggle('immersive-wide', this.previewFullscreen && this.immersiveWide);
    this._syncImmersiveWideButton();
    this._persist();
    this._setStatus(this.immersiveWide ? '已切换为宽屏阅读' : '已切换为标准宽度');
  }

  _syncImmersiveWideButton() {
    const btn = this.immersiveWideRef.current;
    if (!btn) return;
    btn.textContent = this.immersiveWide ? '标准' : '宽屏';
    btn.title = this.immersiveWide ? '切换为标准宽度' : '切换为宽屏阅读';
    btn.setAttribute('aria-pressed', this.immersiveWide ? 'true' : 'false');
  }

  // 正文仍是独立滚动容器（导出、批注和定位依赖它）；工具组同步同一
  // 滚动距离，保持位于文章开头，滚出边界后不再接收点击或键盘焦点。
  _syncReadingToolbarScroll() {
    const pane = this.previewPaneRef?.current, prev = this.previewRef?.current;
    if (!pane || !prev) return;
    const toolbar = pane.querySelector('.reading-toolbar');
    if (!toolbar) return;
    const reading = this.previewFullscreen || this.viewMode === 'preview';
    const offset = reading ? prev.scrollTop : 0;
    const gone = offset >= toolbar.offsetTop + toolbar.offsetHeight;
    toolbar.style.transform = offset ? `translateY(${-offset}px)` : '';
    toolbar.classList.toggle('is-scrolled-away', reading && gone);
    if (reading && gone && this.appearanceOpen) this.toggleReadingAppearance(false);
  }


  _renderPreview() {
    const src = this.sourceRef.current, prev = this.previewRef.current;
    if (!src || !prev || !window.marked) return;
    const markdown = this.previewOverrideMarkdown || src.value;
    // 脉络视图（override 且不属于任何子文档）：节点可点击，样式上给出提示
    prev.classList.toggle('is-reading-map', !!this.previewOverrideMarkdown && !this.activeAnswerRequestId);
    // 路径成文的浮动操作条只在脉络视图出现，跟随每次预览重渲染结算显隐
    if (typeof this._syncReadingPathBar === 'function') this._syncReadingPathBar();
    this._syncPreviewEditable();
    prev.innerHTML = window.marked.parse ? window.marked.parse(markdown) : window.marked(markdown);
    this._renderMermaidDiagrams(prev);
    this._highlightCodeBlocks(prev);
    this._hydrateLocalImages(prev);
    this._applyHighlights();
    // 预览重渲染使旧 Range 失效，搜索打开时按新 DOM 重建高亮（不抢滚动）
    if (this.previewSearchOpen && this._updatePreviewSearchMatches) {
      this._updatePreviewSearchMatches({ keepIndex: true, silent: true });
    }
    this._renderOutline();
    this._updateCount();
  }

  // 桌面端：把预览里的相对路径图片换成 data URL（HTTP 页面拿不到磁盘文件）。
  // 逐张异步替换并按「文档路径::原始 src」缓存，输入过程中的重复渲染不再重复读盘。
  _hydrateLocalImages(root) {
    if (!root || !root.querySelectorAll) return;
    const desktop = typeof window !== 'undefined' && window.mojianDesktop;
    if (!desktop || !desktop.readAsset || !this.localFilePath) return;
    if (!this._localImageCache) this._localImageCache = new Map();
    const docPath = this.localFilePath;
    root.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const localSrc = localImageSource(src);
      if (!localSrc) return;
      const key = docPath + '::' + src;
      const cached = this._localImageCache.get(key);
      if (cached) { img.src = cached; return; }
      desktop.readAsset(docPath, localSrc).then((asset) => {
        if (asset && asset.dataUrl) {
          this._localImageCache.set(key, asset.dataUrl);
          img.src = asset.dataUrl;
        }
      }).catch(() => {});
    });
  }


  _highlightCodeBlocks(root) {
    root.querySelectorAll('pre code').forEach((code) => {
      const text = code.textContent || '';
      const lang = this._codeLanguage(code, text);
      const tokens = this._codeTokens(text, lang);
      if (!tokens) return;
      code.replaceChildren(...tokens.map((token) => this._codeTokenNode(token)));
    });
  }

  _codeLanguage(code, text) {
    const className = code.className || '';
    const match = /\blanguage-([a-z0-9_-]+)/i.exec(className);
    const lang = match ? match[1].toLowerCase() : '';
    if (['ts', 'tsx', 'typescript'].includes(lang)) return 'ts';
    if (['js', 'jsx', 'javascript'].includes(lang)) return 'js';
    if (['json', 'jsonc'].includes(lang)) return 'json';
    if (['sh', 'bash', 'zsh', 'shell'].includes(lang)) return 'shell';
    return this._inferCodeLanguage(text);
  }

  _inferCodeLanguage(text) {
    const trimmed = text.trimStart();
    const first = trimmed.charCodeAt(0);
    if (first === 123 || first === 91) return 'json';
    const firstLine = trimmed.split('\n', 1)[0] || '';
    if (['$', 'npm ', 'pnpm ', 'yarn ', 'git ', 'cd ', 'mkdir ', 'rm '].some((prefix) => firstLine.startsWith(prefix))) return 'shell';
    if (['export ', 'const ', 'let ', 'interface ', 'type ', 'async ', 'await ', 'Promise<'].some((part) => text.includes(part))) return 'ts';
    return '';
  }

  _codeTokens(text, lang) {
    if (!lang) return null;
    if (lang === 'json') return this._tokenizeCode(text, this._jsonCodeRules());
    if (lang === 'shell') return this._tokenizeCode(text, this._shellCodeRules());
    return this._tokenizeCode(text, this._scriptCodeRules());
  }

  _tokenizeCode(text, rules) {
    const tokens = [];
    let index = 0;
    while (index < text.length) {
      const match = this._nextCodeToken(text, index, rules);
      if (!match) {
        tokens.push({ type: '', text: text[index] });
        index += 1;
      } else {
        tokens.push(match);
        index += match.text.length;
      }
    }
    return tokens;
  }

  _nextCodeToken(text, index, rules) {
    for (const rule of rules) {
      rule.re.lastIndex = index;
      const match = rule.re.exec(text);
      if (match && match.index === index) return { type: rule.type, text: match[0] };
    }
    return null;
  }

  _codeTokenNode(token) {
    if (!token.type) return document.createTextNode(token.text);
    const span = document.createElement('span');
    span.className = 'syntax-' + token.type;
    span.textContent = token.text;
    return span;
  }

  _scriptCodeRules() {
    return [
      { type: 'comment', re: /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gy },
      { type: 'string', re: /`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/gy },
      { type: 'number', re: /\b\d+(?:\.\d+)?\b/gy },
      { type: 'keyword', re: /\b(?:async|await|break|case|catch|class|const|continue|default|else|export|extends|finally|for|from|function|if|implements|import|interface|let|new|private|protected|public|return|switch|throw|try|type|var|while)\b/gy },
      { type: 'literal', re: /\b(?:false|null|true|undefined|void)\b/gy },
      { type: 'function', re: /\b[A-Za-z_$][\w$]*(?=\s*\()/gy },
      { type: 'type', re: /\b[A-Z][A-Za-z0-9_$]*\b/gy }
    ];
  }

  _jsonCodeRules() {
    return [
      { type: 'string', re: /"(?:\\.|[^"\\])*"(?=\s*:)/gy },
      { type: 'value', re: /"(?:\\.|[^"\\])*"/gy },
      { type: 'number', re: /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gyi },
      { type: 'literal', re: /\b(?:false|null|true)\b/gy }
    ];
  }

  _shellCodeRules() {
    return [
      { type: 'comment', re: /#[^\n]*/gy },
      { type: 'string', re: /'(?:[^'])*'|"(?:\\.|[^"\\])*"/gy },
      { type: 'keyword', re: /\b(?:case|do|done|elif|else|esac|fi|for|function|if|in|then|while)\b/gy },
      { type: 'number', re: /\b\d+(?:\.\d+)?\b/gy },
      { type: 'function', re: /\b[A-Za-z0-9_.-]+(?=\s)/gy }
    ];
  }


  _outlineSlug(text, index, used) {
    const base = String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section-' + (index + 1);
    let value = 'outline-' + base;
    let suffix = 2;
    while (used.has(value)) value = 'outline-' + base + '-' + suffix++;
    used.add(value);
    return value;
  }


  _renderOutline() {
    const preview = this.previewRef.current;
    const list = this.outlineListRef.current;
    if (!preview || !list) return;
    const headings = Array.from(preview.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const used = new Set();
    list.innerHTML = '';
    headings.forEach((heading, index) => {
      heading.id = this._outlineSlug(heading.textContent, index, used);
      heading.dataset.outlineIndex = String(index);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'outline-item outline-level-' + heading.tagName.slice(1);
      button.dataset.outlineTarget = heading.id;
      button.textContent = heading.textContent.trim() || '未命名标题';
      button.title = button.textContent;
      button.addEventListener('click', () => {
        this._outlineJumpTarget = heading.id;
        this._scrollPreviewTo(heading);
        this._setActiveOutlineItem(heading.id);
        clearTimeout(this._outlineJumpT);
        this._outlineJumpT = setTimeout(() => {
          this._outlineJumpTarget = '';
          this._syncActiveOutlineItem();
        }, 700);
        if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
          this.toggleOutline(false);
        }
      });
      list.appendChild(button);
    });
    if (!headings.length) {
      const empty = document.createElement('div');
      empty.className = 'outline-empty';
      empty.textContent = '当前文章还没有标题。使用 #、## 等 Markdown 标题后，大纲会自动生成。';
      list.appendChild(empty);
    }
    if (this.outlineCountRef.current) {
      this.outlineCountRef.current.textContent = String(headings.length);
    }
    if (this.outlineButtonRef.current) {
      this.outlineButtonRef.current.disabled = headings.length === 0;
      this.outlineButtonRef.current.title = headings.length ? '查看文章大纲' : '当前文章没有标题';
    }
    this._syncActiveOutlineItem();
  }


  _setActiveOutlineItem(targetId) {
    const list = this.outlineListRef.current;
    if (!list) return;
    list.querySelectorAll('.outline-item').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.outlineTarget === targetId);
    });
  }


  _syncActiveOutlineItem() {
    const preview = this.previewRef.current;
    if (!preview) return;
    const headings = Array.from(preview.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    if (!headings.length) return;
    if (this._outlineJumpTarget) {
      this._setActiveOutlineItem(this._outlineJumpTarget);
      return;
    }
    if (preview.scrollTop + preview.clientHeight >= preview.scrollHeight - 8) {
      this._setActiveOutlineItem(headings[headings.length - 1].id);
      return;
    }
    const previewTop = preview.getBoundingClientRect().top;
    const marker = previewTop + 80;
    let active = headings[0];
    let distance = Math.abs(active.getBoundingClientRect().top - marker);
    headings.slice(1).forEach((heading) => {
      const nextDistance = Math.abs(heading.getBoundingClientRect().top - marker);
      if (nextDistance < distance) {
        active = heading;
        distance = nextDistance;
      }
    });
    this._setActiveOutlineItem(active.id);
  }


  toggleOutline(force) {
    this.outlineOpen = typeof force === 'boolean' ? force : !this.outlineOpen;
    const panel = this.outlinePanelRef.current;
    const button = this.outlineButtonRef.current;
    if (panel) panel.classList.toggle('is-open', this.outlineOpen);
    if (button) {
      button.classList.toggle('is-active', this.outlineOpen);
      button.setAttribute('aria-expanded', this.outlineOpen ? 'true' : 'false');
    }
    if (this.outlineOpen) this._syncActiveOutlineItem();
  }


  _openPreviewLink(event) {
    const target = event.target && event.target.closest ? event.target.closest('a') : null;
    const preview = this.previewRef.current;
    if (!target || !preview || !preview.contains(target)) return;
    const rawHref = target.getAttribute('href') || '';
    if (!rawHref || /^\s*(javascript|data|vbscript):/i.test(rawHref)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (rawHref.startsWith('#')) {
      const id = decodeURIComponent(rawHref.slice(1));
      const destination = id && document.getElementById(id);
      if (destination && preview.contains(destination)) {
        destination.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    try {
      const url = new URL(rawHref, window.location.href);
      window.open(url.href, '_blank', 'noopener,noreferrer');
    } catch {
      this._setStatus('无法打开链接 · ' + rawHref);
    }
  }


  _updateCount() {
    const src = this.sourceRef.current;
    if (!src) return;
    const text = src.value || '';
    const chars = text.replace(/\s/g, '').length;
    const lines = text.length ? text.split('\n').length : 0;
    if (this.countRef.current) this.countRef.current.textContent = chars + ' 字 · ' + lines + ' 行';
  }


  _touch() {
    this._setDirty(true);
    if (this._saveT) clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this._autosave(), 600);
  }


  _setDirty(d) {
    this.dirty = d;
    if (this.dirtyDotRef.current) this.dirtyDotRef.current.style.background = d ? 'var(--accent)' : 'var(--text-4)';
  }


  _autosave() {
    const src = this.sourceRef.current;
    if (!src) return;
    const saved = this._persist();
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    this._setStatus(saved === false ? '草稿保存失败 · 请保存到文件' : '草稿已保存到此浏览器 · ' + hh + ':' + mm);
    // 打开了本地文件时，草稿同时写穿回本地（异步，不阻塞输入）。
    if (typeof this._maybeWriteThroughLocalFile === 'function') this._maybeWriteThroughLocalFile();
  }


  _setStatus(msg) { if (this.saveStatusRef.current) this.saveStatusRef.current.textContent = msg; }


  _applyFont() {
    const px = this.fontSize;
    const prev = this.previewRef.current, src = this.sourceRef.current;
    if (prev) prev.style.fontSize = px + 'px';
    if (src) src.style.fontSize = px + 'px';
    if (this.fontSizeRef.current) this.fontSizeRef.current.textContent = px + 'px';
    if (this.fullscreenFontSizeRef?.current) this.fullscreenFontSizeRef.current.textContent = px + 'px';
  }


  _setFont(px) {
    this.fontSize = Math.max(12, Math.min(28, px));
    this._applyFont();
    this._persist();
    this._setStatus('字号 ' + this.fontSize + 'px');
  }


  _setFileName(name) {
    this.fileName = name;
    if (this.fileNameRef.current) this.fileNameRef.current.textContent = name;
    if (typeof this._syncFileNameTooltip === 'function') this._syncFileNameTooltip();
    if (typeof this._updateFooterPath === 'function') this._updateFooterPath();
  }

}
