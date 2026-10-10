// @ts-nocheck
import { t } from './i18n.ts';
import { sampleLanguage } from './sample.ts';

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
    if (this.themeLabelRef?.current) this.themeLabelRef.current.textContent = this.theme === 'dark' ? t('暗色') : t('亮色');
    this._applyPaper();
  }


  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this._themeTouched = true;
    this._applyTheme();
    this._persist();
    this._setStatus(t('已切换为{theme}模式', { theme: t(this.theme === 'dark' ? '暗黑' : '亮色') }));
  }

  // ===== paper（内容纸色，与框架主题解耦） =====

  PAPERS() {
    return [
      { id: 'ink', label: t('墨黑'), swatch: '#1c1a17' },
      { id: 'parchment', label: t('羊皮纸'), swatch: '#f9ebcc' },
      { id: 'cream', label: t('米黄'), swatch: '#f0e9d1' },
      { id: 'snow', label: t('清爽白'), swatch: '#ffffff' },
      { id: 'green', label: t('豆沙绿'), swatch: '#c0edc6' }
    ];
  }

  _resolvedPaper() {
    // 纸色按主题分别记忆；未选择时暗→墨黑、亮→清爽白
    const pref = this.theme === 'light' ? this.paperLight : this.paperDark;
    return pref || (this.theme === 'light' ? 'snow' : 'ink');
  }

  _applyPaper() {
    this._syncQuickAppearance?.();
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
    this._setStatus(t('纸色已切换为「{paper}」', { paper: item ? item.label : id }));
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
      dot.title = t('纸色：{paper}', { paper: p.label });
      dot.setAttribute('aria-label', t('纸色：{paper}', { paper: p.label }));
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
  }

  _readingAppearanceRenderVals() {
    return {
      appearancePanelRef: this.appearancePanelRef,
      closeReadingAppearance: () => this.toggleReadingAppearance(false, true)
    };
  }

  togglePreviewFullscreen(force) {
    const pane = this.previewPaneRef.current;
    if (!pane) return;
    const next = typeof force === 'boolean' ? force : !this.previewFullscreen;
    if (next === this.previewFullscreen) return;
    this._focusWorkspacePanels?.(next);
    this.previewFullscreen = next;
    this._syncPreviewEditable();
    pane.classList.toggle('preview-pane-fullscreen', this.previewFullscreen);
    pane.classList.toggle('immersive-wide', this.previewFullscreen && this.immersiveWide);
    this._syncFullscreenLayout();
    document.body.style.overflow = this.previewFullscreen ? 'hidden' : '';
    this._syncReadingToolbarScroll();
    if (this.fullscreenLabelRef.current) {
      this.fullscreenLabelRef.current.textContent = this.previewFullscreen ? t('退出专注') : t('专注');
    }
    if (this.fullscreenIconRef.current) {
      this.fullscreenIconRef.current.innerHTML = this.previewFullscreen
        ? '<path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"></path>'
        : '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path>';
    }
    this._setStatus(this.previewFullscreen ? t('已进入沉浸式阅读 · 按 Esc 退出') : t('已退出沉浸式阅读'));
  }

  _syncPreviewEditable() {
    const prev = this.previewRef.current;
    if (!prev) return;
    prev.setAttribute('contenteditable', 'false');
    if (this.previewTitleRef.current) {
      this.previewTitleRef.current.textContent = t('预览 · 仅阅读');
    }
  }

  // ===== 沉浸式：宽屏切换与工具条自动隐藏 =====

  toggleImmersiveWide() {
    this.immersiveWide = !this.immersiveWide;
    const pane = this.previewPaneRef.current;
    if (pane) pane.classList.toggle('immersive-wide', this.previewFullscreen && this.immersiveWide);
    this._syncImmersiveWideButton();
    this._persist();
    this._setStatus(this.immersiveWide ? t('已切换为宽屏阅读') : t('已切换为标准宽度'));
  }

  _syncImmersiveWideButton() {
    const btn = this.immersiveWideRef.current;
    if (!btn) return;
    btn.textContent = this.immersiveWide ? t('标准') : t('宽屏');
    btn.title = this.immersiveWide ? t('切换为标准宽度') : t('切换为宽屏阅读');
    btn.setAttribute('aria-pressed', this.immersiveWide ? 'true' : 'false');
  }

  // 阅读/专注工具条按滚动方向收起：下滑藏、上滑或回顶再显示。
  // sticky「退出专注」专注态常驻，不随工具条收起。
  _syncReadingToolbarScroll() {
    const pane = this.previewPaneRef?.current, prev = this.previewRef?.current;
    if (!pane || !prev) return;
    const toolbar = pane.querySelector('.reading-toolbar');
    const sticky = pane.querySelector('.focus-exit-sticky');
    if (!toolbar) return;
    const focus = !!this.previewFullscreen;
    const reading = focus || this.viewMode === 'preview';
    if (sticky) sticky.hidden = !focus;
    if (!reading) {
      toolbar.style.transform = '';
      toolbar.classList.remove('is-scrolled-away');
      this._readingToolbarLastScroll = 0;
      return;
    }
    const top = prev.scrollTop || 0;
    const last = this._readingToolbarLastScroll ?? top;
    const delta = top - last;
    this._readingToolbarLastScroll = top;
    let hide = toolbar.classList.contains('is-scrolled-away');
    if (top <= 8) hide = false;
    else if (delta > 2) hide = true;
    else if (delta < -2) hide = false;
    // 方向收起用 class，不再跟滚 translate（避免半透明叠字感）
    toolbar.style.transform = '';
    toolbar.classList.toggle('is-scrolled-away', hide);
  }


  _renderPreview() {
    const src = this.sourceRef.current, prev = this.previewRef.current;
    if (!src || !prev || !window.marked) return;
    const markdown = this.previewOverrideMarkdown || src.value;
    src.setAttribute('lang', sampleLanguage(src.value));
    prev.setAttribute('lang', sampleLanguage(markdown));
    // 脉络视图（override 且不属于任何子文档）：节点可点击，样式上给出提示
    prev.classList.toggle('is-reading-map', !!this.previewOverrideMarkdown && !this.activeAnswerRequestId);
    // 路径成文的浮动操作条只在脉络视图出现，跟随每次预览重渲染结算显隐
    if (typeof this._syncReadingPathBar === 'function') this._syncReadingPathBar();
    this._syncPreviewEditable();
    prev.innerHTML = window.marked.parse ? window.marked.parse(markdown) : window.marked(markdown);
    this._syncReadingScript?.();
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
      this._setStatus(t('无法打开链接 · {error}', { error: rawHref }));
    }
  }


  _updateCount() {
    const src = this.sourceRef.current;
    if (!src) return;
    const text = src.value || '';
    const chars = text.replace(/\s/g, '').length;
    const lines = text.length ? text.split('\n').length : 0;
    if (this.countRef.current) this.countRef.current.textContent = t('{chars} 字 · {lines} 行', { chars, lines });
  }


  _touch() {
    this._startedWithSample = false;
    this._documentEditRevision = (this._documentEditRevision || 0) + 1;
    this._setDirty(true);
    if (this._saveT) clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this._autosave(), 600);
  }


  _setDirty(d) {
    this.dirty = d;
    this._syncWorkspaceChrome?.();
    if (this.dirtyDotRef.current) this.dirtyDotRef.current.style.background = d ? 'var(--accent)' : 'var(--text-4)';
  }


  _autosave() {
    const src = this.sourceRef.current;
    if (!src) return;
    const saved = this._persist();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    this._draftSavedAt = Date.now();
    this._lastWriteBackLabel = `${hh}:${mm}`;
    if (saved === false) {
      this._setStatus(t('草稿保存失败 · 请保存到文件'));
    }
    this._syncPersistentStatus?.();
    // 打开了本地文件时，草稿同时写穿回本地（异步，不阻塞输入）。
    if (typeof this._maybeWriteThroughLocalFile === 'function') this._maybeWriteThroughLocalFile();
  }

  /** 底栏常驻槽：草稿/文件安全句，不被临时 toast 覆盖。 */
  _syncPersistentStatus() {
    const node = this.persistStatusRef?.current;
    if (!node) return;
    const hasFile = !!(this.fileHandle || this.localFilePath);
    let text;
    if (this._localFileConflict) {
      text = t('文件冲突');
    } else if (hasFile) {
      text = this._lastWriteBackLabel
        ? t('已写回 · {time}', { time: this._lastWriteBackLabel })
        : t('已与文件同步');
    } else if (typeof window !== 'undefined' && window.mojianDesktop) {
      text = t('编辑后自动保存桌面草稿');
    } else {
      text = t('草稿已自动保存在此浏览器');
    }
    node.textContent = text;
    this._syncWorkspaceChrome?.();
  }

  /** 临时 toast 槽：≤5s，不得替换常驻槽。 */
  _setStatus(msg) {
    const toast = this.saveStatusRef?.current;
    if (toast) {
      toast.textContent = msg || '';
      toast.hidden = !msg;
      clearTimeout(this._statusToastT);
      if (msg) {
        this._statusToastT = setTimeout(() => {
          if (this.saveStatusRef?.current === toast) {
            toast.textContent = '';
            toast.hidden = true;
          }
        }, 5000);
      }
    }
    this._syncWorkspaceChrome?.();
  }


  _applyFont() {
    this._syncQuickAppearance?.();
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
    this._setStatus(t('字号 {size}px', { size: this.fontSize }));
  }


  _setFileName(name) {
    this.fileName = name;
    if (!this.agentBridgeEnabled) this._renderRecentDocuments?.();
    if (this.fileNameRef.current) this.fileNameRef.current.textContent = name;
    if (typeof this._syncFileNameTooltip === 'function') this._syncFileNameTooltip();
    if (typeof this._updateFooterPath === 'function') this._updateFooterPath();
  }

}
