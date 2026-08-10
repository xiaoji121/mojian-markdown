// @ts-nocheck
// 路径成文：在阅读脉络里选出一条追问路径（节点多选），把路径上的问答、
// 批注与原文交给 AI，整理成长文（article）或写成一篇二创（remix）。
// 节点点击的劫持入口在 readingMapMethods，选择模式开启时转交到这里；
// 选择状态、浮动操作条、/api/compose 的流式生成与结果打开都归本模块。
import { bridgeUrl } from './bridgeClient.ts';

// 两种成文模式的说明（问号浮层用）。上下文相同，差别只在写作任务。
const PATH_HELP = {
  article: {
    title: '整理成长文',
    body: '忠于这条阅读路径的「梳理」：以你的追问与批注为主线，融合原文观点与各节点回答，'
      + '保留必要的原文引用，重组成一篇结构完整、有起承转合的长文。适合把一次深读沉淀成完整笔记。'
  },
  remix: {
    title: '写一篇二创',
    body: '以路径中的思考为素材的「再创作」：围绕你在追问里真正关心的问题重新立意，'
      + '写一篇有独立视角的新文章；可引用原文观点，但不复述原文结构。适合把阅读启发变成你自己的文章。'
  }
};
const PATH_HELP_FOOTER = '两种模式读到的上下文相同：原文全文 + 路径节点的问答与回答 + 你的批注。'
  + '个性化要求（如「用第一人称写」）写进旁边的补充要求输入框即可。';

export class PathComposeMethods {
  _isReadingMapView() {
    return !!(this.previewOverrideMarkdown && !this.activeAnswerRequestId && this._readingMapIndex);
  }


  // 本功能的模板 refs 与事件绑定，由 MarkdownEditorLogic 的 renderVals() 展开。
  _readingPathRenderVals() {
    return {
      readingPathBarRef: this.readingPathBarRef,
      readingPathModeRef: this.readingPathModeRef,
      readingPathCountRef: this.readingPathCountRef,
      readingPathInstructionRef: this.readingPathInstructionRef,
      toggleReadingPathMode: () => this.toggleReadingPathMode(),
      clearReadingPathSelection: () => this.clearReadingPathSelection(),
      composePathArticle: () => this.composeReadingPath('article'),
      composePathRemix: () => this.composeReadingPath('remix'),
      helpPathArticle: (event) => this.toggleReadingPathHelp('article', event),
      helpPathRemix: (event) => this.toggleReadingPathHelp('remix', event)
    };
  }


  // 进入脉络视图时结算选择状态：换了文档就清空，同文档往返保留。
  _resetReadingPathForDocument(documentId) {
    if (this._readingPathDocId !== documentId) {
      this._readingPathDocId = documentId;
      this._readingPathSelection = new Set();
      this.readingPathSelectMode = false;
    }
    this._syncReadingPathBar();
  }


  toggleReadingPathMode(force) {
    this.readingPathSelectMode = typeof force === 'boolean' ? force : !this.readingPathSelectMode;
    this._syncReadingPathBar();
    this._applyReadingPathHighlight();
    this._setStatus(this.readingPathSelectMode
      ? '路径选择已开启 · 点击节点选中它与它的上级链路'
      : '路径选择已关闭 · 点击节点打开对应子文档');
  }


  clearReadingPathSelection() {
    if (this._readingPathSelection) this._readingPathSelection.clear();
    this._syncReadingPathBar();
    this._applyReadingPathHighlight();
    this._setStatus('已清空路径选择');
  }


  _toggleReadingPathNode(requestId) {
    if (!this._readingPathSelection) this._readingPathSelection = new Set();
    const selected = this._readingPathSelection;
    if (selected.has(requestId)) {
      selected.delete(requestId);
    } else {
      // 点选节点连同上级链路：一次点击挑出整条路径（主文档 doc0 需单独点选）
      selected.add(requestId);
      const seen = new Set([requestId]);
      let current = (this._readingMapParents && this._readingMapParents.get(requestId)) || '';
      while (current && !seen.has(current)) {
        seen.add(current);
        selected.add(current);
        current = this._readingMapParents.get(current) || '';
      }
    }
    this._syncReadingPathBar();
    this._applyReadingPathHighlight();
  }


  _syncReadingPathBar() {
    const visible = this._isReadingMapView() && !this._composeBusy;
    if (!visible) this._hideReadingPathHelp();
    const prev = this.previewRef && this.previewRef.current;
    if (prev && prev.classList) prev.classList.toggle('is-path-select-mode', visible && !!this.readingPathSelectMode);
    const bar = this.readingPathBarRef && this.readingPathBarRef.current;
    if (!bar) return;
    bar.classList.toggle('is-visible', visible);
    const count = this._readingPathSelection ? this._readingPathSelection.size : 0;
    const modeButton = this.readingPathModeRef && this.readingPathModeRef.current;
    if (modeButton) {
      modeButton.classList.toggle('is-active', !!this.readingPathSelectMode);
      modeButton.setAttribute('aria-pressed', this.readingPathSelectMode ? 'true' : 'false');
    }
    const countEl = this.readingPathCountRef && this.readingPathCountRef.current;
    if (countEl) {
      countEl.textContent = this.readingPathSelectMode
        ? (count ? '已选 ' + count + ' 个节点' : '点击图中节点选中整条路径')
        : '开启选择后点选节点，AI 按路径成文';
    }
    if (bar.querySelectorAll) {
      bar.querySelectorAll('[data-compose-action]').forEach((button) => {
        button.disabled = !count || !!this._composeBusy;
      });
    }
  }


  _applyReadingPathHighlight() {
    const prev = this.previewRef && this.previewRef.current;
    if (!prev || !prev.querySelectorAll || !this._readingMapIndex) return;
    const selected = this._readingPathSelection || new Set();
    prev.querySelectorAll('.mermaid-rendered .node').forEach((node) => {
      const match = /(?:^|-)(doc0|q\d+)(?:-|$)/.exec(node.id || '');
      const requestId = match ? this._readingMapIndex[match[1]] : undefined;
      if (node.classList) {
        node.classList.toggle('is-path-selected', requestId !== undefined && selected.has(requestId));
      }
    });
  }


  // mermaid 渲染是异步的（主题切换等也会触发重渲染），完成后补挂选中态。
  _onMermaidRendered(host) {
    if (!this._isReadingMapView()) return;
    if (typeof this._applyReadingMapTitles === 'function') this._applyReadingMapTitles(host);
    this._applyReadingPathHighlight();
  }


  // ===== 模式说明浮层（? 按钮，单例挂 body，点外部关闭） =====

  toggleReadingPathHelp(mode, event) {
    const open = this._readingPathHelpEl && this._readingPathHelpEl.classList.contains('is-visible');
    if (open && this._readingPathHelpMode === mode) {
      this._hideReadingPathHelp();
      return;
    }
    const info = PATH_HELP[mode];
    if (!info || typeof document === 'undefined' || !document.body) return;
    let pop = this._readingPathHelpEl;
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'reading-path-help-popover';
      document.body.appendChild(pop);
      this._readingPathHelpEl = pop;
    }
    pop.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = info.title;
    const body = document.createElement('p');
    body.textContent = info.body;
    const footer = document.createElement('small');
    footer.textContent = PATH_HELP_FOOTER;
    pop.append(title, body, footer);
    pop.classList.add('is-visible');
    this._readingPathHelpMode = mode;
    this._positionReadingPathHelp(pop, event && (event.currentTarget || event.target));
    this._bindReadingPathHelpDismiss();
  }


  // 定位到 ? 按钮上方居中；顶部放不下时翻到下方。单测环境无布局能力，直接跳过。
  _positionReadingPathHelp(pop, anchor) {
    if (!anchor || !anchor.getBoundingClientRect || typeof window === 'undefined' || !pop.style) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 10;
    pop.style.maxWidth = Math.min(340, window.innerWidth - margin * 2) + 'px';
    pop.style.left = '0px';
    pop.style.top = '0px';
    const width = pop.offsetWidth || 0;
    const height = pop.offsetHeight || 0;
    const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - margin));
    let top = rect.top - height - 8;
    if (top < margin) top = rect.bottom + 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }


  _bindReadingPathHelpDismiss() {
    if (this._readingPathHelpDocH || typeof document === 'undefined' || !document.addEventListener) return;
    this._readingPathHelpDocH = (e) => {
      const target = e.target;
      if (this._readingPathHelpEl && target && this._readingPathHelpEl.contains && this._readingPathHelpEl.contains(target)) return;
      if (target && target.closest && target.closest('.reading-path-help')) return;
      this._hideReadingPathHelp();
    };
    document.addEventListener('click', this._readingPathHelpDocH);
  }


  _hideReadingPathHelp() {
    if (this._readingPathHelpEl) this._readingPathHelpEl.classList.remove('is-visible');
    this._readingPathHelpMode = '';
    if (this._readingPathHelpDocH) {
      document.removeEventListener('click', this._readingPathHelpDocH);
      this._readingPathHelpDocH = null;
    }
  }


  _disposeReadingPathHelp() {
    this._hideReadingPathHelp();
    if (this._readingPathHelpEl && this._readingPathHelpEl.remove) this._readingPathHelpEl.remove();
    this._readingPathHelpEl = null;
  }


  // 生成中的流式重渲染做合并：整篇 markdown 重解析不便宜，120ms 内只渲一次。
  _scheduleComposeRender() {
    if (this._composeRenderT) return;
    this._composeRenderT = setTimeout(() => {
      this._composeRenderT = null;
      this._renderPreview();
    }, 120);
  }


  _clearComposeRender() {
    clearTimeout(this._composeRenderT);
    this._composeRenderT = null;
  }


  async composeReadingPath(mode) {
    if (!this.agentBridgeEnabled || this._composeBusy) return;
    const selected = this._readingPathSelection;
    const documentId = this._readingPathDocId || this.bridgeDocumentId;
    if (!selected || !selected.size || !documentId) {
      this._setStatus('请先开启「选择路径」并点选脉络图中的节点');
      return;
    }
    const label = mode === 'remix' ? '路径二创' : '路径长文';
    const engineLabel = this._aiEngineLabel();
    const instructionInput = this.readingPathInstructionRef && this.readingPathInstructionRef.current;
    const instruction = String((instructionInput && instructionInput.value) || '').trim() || undefined;
    const mapMarkdown = this.previewOverrideMarkdown;
    const streamHeader = '# ' + label + ' · 生成中…\n\n> ' + engineLabel + ' 正在阅读你选择的 '
      + selected.size + ' 个节点 · 成文将自动存入最近阅读\n\n';
    this._composeBusy = true;
    this._syncReadingPathBar();
    this.previewOverrideMarkdown = streamHeader;
    this._renderPreview();
    this._setStatus(engineLabel + ' 正在按阅读路径撰写' + label + '…');
    let generated = '';
    let result = null;
    // 用户中途切走视图（打开别的文档等）后不再抢占预览，也不自动打开结果。
    let viewActive = true;
    const stillHere = () => viewActive && String(this.previewOverrideMarkdown).startsWith(streamHeader);
    try {
      const response = await fetch(bridgeUrl('/api/compose'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          requestIds: [...selected],
          mode,
          instruction,
          engine: (this.aiEngine === 'codex' || this.aiEngine === 'gemini') ? this.aiEngine : 'claude'
        })
      });
      if (!response.ok || !response.body) throw new Error('本地 Agent Bridge 无响应');
      await this._readComposeStream(response, {
        delta: (data) => {
          if (!data || !data.text) return;
          generated += data.text;
          if (!stillHere()) { viewActive = false; return; }
          this.previewOverrideMarkdown = streamHeader + generated;
          this._scheduleComposeRender();
        },
        done: (data) => { result = data || null; },
        error: (data) => { throw new Error((data && data.message) || '生成失败'); }
      });
      if (!result || !result.composedDocumentId) throw new Error('生成结果为空');
      this._clearComposeRender();
      const openHere = stillHere();
      if (openHere) this._renderPreview();
      await this._refreshRecentDocuments();
      if (openHere) await this.openRecentDocument(result.composedDocumentId);
      this._setStatus(label + '已生成 · ' + (result.fileName || '已存入最近阅读'));
    } catch (error) {
      this._clearComposeRender();
      if (stillHere()) {
        this.previewOverrideMarkdown = mapMarkdown;
        this._renderPreview();
      }
      this._setStatus(label + '生成失败 · ' + ((error && error.message) ? error.message : String(error)));
    } finally {
      this._composeBusy = false;
      this._syncReadingPathBar();
    }
  }


  async _readComposeStream(response, handlers) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const packets = buffer.split('\n\n');
      buffer = packets.pop() || '';
      for (const packet of packets) {
        let event = 'message';
        let data = null;
        packet.split('\n').forEach((line) => {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) {
            try { data = JSON.parse(line.slice(5).trim()); } catch (e) {}
          }
        });
        if (handlers[event]) handlers[event](data);
      }
    }
  }
}
