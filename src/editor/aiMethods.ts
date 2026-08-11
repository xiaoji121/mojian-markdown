// @ts-nocheck
import { bridgeUrl } from './bridgeClient.ts';

export class AIMethods {
  aiAsk() {
    if (!this.agentBridgeEnabled) {
      this.copySel();
      this._setStatus('官网版暂不提供 AI 助手，已复制选中文字');
      return;
    }
    const p = this._pending; if (!p) return;
    this.aiQuote = p.quote;
    this.aiOccurrence = p.occ || 0;
    this.aiStart = p.start;
    this._openAIPanel(true);
    this._renderAIQuote();
    const s = window.getSelection(); if (s) s.removeAllRanges();
    if (this.selBarRef.current) this.selBarRef.current.style.display = 'none';
    setTimeout(() => {
      const input = this.aiInputRef.current;
      if (input) input.focus();
    }, 80);
    this._setStatus('已将划线内容发送到 AI 助手');
  }


  // ===== AI 引擎切换（本地 CLI / API Agent） =====

  _aiEngineLabel(engine) {
    const value = engine || this.aiEngine;
    if (value === 'codex') return 'Codex';
    if (value === 'gemini') return 'Gemini';
    if (value === 'kimi') return 'Kimi';
    if (value === 'qwen') return '通义千问';
    if (value === 'custom') return '自定义 Agent';
    return 'Claude';
  }


  setAIEngine(engine) {
    this.aiEngine = ['codex', 'gemini', 'kimi', 'qwen', 'custom'].includes(engine) ? engine : 'claude';
    this._syncAIEngineSwitch();
    this._persist(false);
    this._setStatus('AI 引擎已切换为 ' + this._aiEngineLabel());
  }


  // ===== 统一提问入口 =====
  // 普通阅读问题保持只读；只有明确要求操作项目、文件或外部发布时，才按次申请工具权限。
  _questionNeedsProjectTools(question) {
    const text = String(question || '').trim();
    if (!text) return false;
    if (this._questionNeedsWriteAccess(text)) return true;
    const action = /(读取|查看|搜索|修改|改动|改一下|修复|实现|创建|新建|删除|移除|重命名|写入|保存到|发布到|上传|运行|执行|安装|提交|推送|部署|生成文件|read|inspect|search|edit|modify|fix|implement|create|delete|rename|write|save|publish|upload|run|execute|install|commit|push|deploy)/i;
    const target = /(原文|文档|文章|正文|项目|工程|代码|文件|目录|仓库|测试|命令|脚本|README|飞书|钉钉|document|article|project|code|file|folder|directory|repo|test|command|script)/i;
    return action.test(text) && target.test(text);
  }


  _questionNeedsWriteAccess(question) {
    const text = String(question || '').trim();
    const writeAction = /(修改|改动|改一下|改|润色|修复|实现|创建|新建|删除|移除|重命名|写入|写回|替换|整理到|edit|modify|fix|implement|create|delete|rename|write|replace)/i;
    const target = /(原文|文档|文章|正文|项目|工程|代码|文件|目录|仓库|README|document|article|project|code|file|folder|directory|repo)/i;
    const contextualShortReply = /(?:直接|帮我|那就|现在|按.+)(?:改|修改|写回)|(?:改|修改|写回)(?:吧|它|这个)/i;
    return writeAction.test(text) && (target.test(text) || contextualShortReply.test(text));
  }


  _resolveQuestionMode(question, confirmTools = (message) => window.confirm(message)) {
    if (!this._questionNeedsProjectTools(question)) return 'chat';
    const confirmed = confirmTools(this._questionNeedsWriteAccess(question)
      ? '这条请求需要修改当前文档或项目文件。\n\n是否仅为本次请求授予写入权限？'
      : '这条请求需要使用项目工具。\n\n是否仅为本次请求授权？');
    return confirmed ? 'agent' : null;
  }


  // 引擎切换入口在顶栏「设置」弹窗里；面板头部只放一枚只读 chip 显示当前引擎。
  _syncAIEngineSwitch() {
    const chip = this.aiEngineChipRef?.current;
    if (chip) chip.textContent = this._aiEngineLabel();
    if (typeof this._syncAISettingsEngine === 'function') this._syncAISettingsEngine();
  }


  _aiChatRequestBody(question, mode = 'chat') {
    return {
      question,
      engine: ['codex', 'gemini', 'kimi', 'qwen', 'custom'].includes(this.aiEngine) ? this.aiEngine : 'claude',
      mode: mode === 'agent' ? 'agent' : 'chat',
      allowWrite: mode === 'agent' && this._questionNeedsWriteAccess(question),
      document: this._documentPayload(),
      // 在子文档视图里追问时带上父节点，服务端把这次问答挂进追问树。
      parentRequestId: (this.previewOverrideMarkdown && this.activeAnswerRequestId) || undefined,
      selection: {
        quote: this.aiQuote,
        occurrence: this.aiOccurrence || 0,
        surroundingText: this.aiQuote ? this._selectionContext() : ''
      }
    };
  }


  _initAI() {
    if (!this.agentBridgeEnabled) return;
    this._syncAIEngineSwitch();
    const input = this.aiInputRef.current;
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendAIQuestion();
        }
      });
    }
    try {
      const savedWidth = Number(localStorage.getItem('md-editor-ai-panel-width'));
      if (savedWidth) this.aiPanelWidth = savedWidth;
    } catch (e) {}
    this._applyAIPanelWidth(this.aiPanelWidth);
    this._initAIResize();
    this._renderAIMessages();
    this._checkAIBridge();
  }


  _applyAIPanelWidth(width) {
    const aside = this.aiPanelRef.current;
    const split = this.splitRef.current;
    if (!aside || !split) return;
    const max = Math.max(380, Math.min(920, window.innerWidth * 0.72));
    this.aiPanelWidth = Math.round(Math.max(380, Math.min(max, width || 480)));
    aside.style.width = this.aiPanelWidth + 'px';
    split.style.setProperty('--active-side-panel-width', this.aiPanelWidth + 'px');
  }


  _initAIResize() {
    const handle = this.aiResizeRef.current;
    if (!handle) return;
    let dragging = false;
    const move = (e) => {
      if (dragging) this._applyAIPanelWidth(window.innerWidth - e.clientX);
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('md-editor-ai-panel-width', String(this.aiPanelWidth)); } catch (e) {}
    };
    handle.addEventListener('mousedown', (e) => {
      if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) return;
      dragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }


  async _checkAIBridge() {
    this._setAIStatus('正在连接本地 Agent…', 'checking');
    try {
      const response = await fetch(bridgeUrl('/health'), {
        signal: AbortSignal.timeout ? AbortSignal.timeout(1800) : undefined
      });
      if (!response.ok) throw new Error('Bridge unavailable');
      this.aiBridgeOnline = true;
      this._setAIStatus('本地 Agent 已连接', 'online');
      this._refreshAIConversations();
      this._refreshRecentDocuments();
    } catch (e) {
      this.aiBridgeOnline = false;
      this._setAIStatus('本地 Agent 未启动', 'offline');
    }
  }


  _setAIStatus(text, state) {
    const el = this.aiStatusRef.current;
    if (!el) return;
    el.textContent = text;
    el.setAttribute('data-state', state || '');
  }


  _openAIPanel(show) {
    if (!this.agentBridgeEnabled) return;
    const aside = this.aiPanelRef.current;
    if (!aside) return;
    this.aiPanelOpen = (show === undefined || show === null) ? !this.aiPanelOpen : show;
    aside.style.display = this.aiPanelOpen ? 'flex' : 'none';
    if (this.aiPanelOpen) this._applyAIPanelWidth(this.aiPanelWidth);
    if (this.aiPanelOpen && this.panelOpen) {
      this.panelOpen = false;
      if (this.commentsRef.current) this.commentsRef.current.style.display = 'none';
    }
    this._syncFullscreenLayout();
    if (this.aiPanelOpen) {
      this._refreshAIConversations();
      if (!this.aiMessages.length) this._loadCurrentDocumentHistory();
    }
  }


  async _loadCurrentDocumentHistory() {
    try {
      const response = await fetch(bridgeUrl('/api/history'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: this._documentPayload() })
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.messages && data.messages.length) this._showConversationMessages(data.documentId, data.messages, null, true);
    } catch (e) {}
  }


  async _refreshAIConversations() {
    try {
      const response = await fetch(bridgeUrl('/api/conversations'));
      if (!response.ok) return;
      const data = await response.json();
      this.aiConversations = Array.isArray(data.conversations) ? data.conversations : [];
      this._renderAIHistory();
    } catch (e) {}
  }


  toggleAIHistory() {
    this.aiHistoryOpen = !this.aiHistoryOpen;
    const panel = this.aiHistoryRef.current;
    if (panel) panel.style.display = this.aiHistoryOpen ? 'flex' : 'none';
    if (this.aiHistoryOpen) this._refreshAIConversations();
  }


  _renderAIHistory() {
    const list = this.aiHistoryListRef.current;
    if (!list) return;
    list.innerHTML = '';
    if (!this.aiConversations.length) {
      const empty = document.createElement('div');
      empty.className = 'ai-history-empty';
      empty.textContent = '还没有本地问答历史';
      list.appendChild(empty);
      return;
    }
    this.aiConversations.forEach((conversation) => {
      const button = document.createElement('button');
      button.className = 'ai-history-item';
      const title = document.createElement('strong');
      title.textContent = conversation.title || '未命名文档';
      const question = document.createElement('span');
      question.textContent = conversation.lastQuestion || '阅读问答';
      const meta = document.createElement('small');
      meta.textContent = conversation.questionCount + ' 个问题' +
        (conversation.updatedAt ? ' · ' + new Date(conversation.updatedAt).toLocaleString() : '');
      button.appendChild(title);
      button.appendChild(question);
      button.appendChild(meta);
      button.addEventListener('click', () => this._loadAIConversation(conversation.documentId));
      list.appendChild(button);
    });
  }


  async _loadAIConversation(documentId, focusRequestId) {
    try {
      const response = await fetch(bridgeUrl('/api/conversations/') + encodeURIComponent(documentId));
      if (!response.ok) throw new Error('历史读取失败');
      const data = await response.json();
      this._showConversationMessages(documentId, data.messages || [], focusRequestId);
      this.aiHistoryOpen = false;
      if (this.aiHistoryRef.current) this.aiHistoryRef.current.style.display = 'none';
    } catch (error) {
      this._setAIStatus(error.message || '历史读取失败', 'offline');
    }
  }


  _showConversationMessages(documentId, history, focusRequestId, syncComments) {
    this.aiMessages = [];
    history.forEach((item) => {
      if (item.question) this.aiMessages.push({
        id: 'u-' + item.requestId, role: 'user', text: item.question,
        quote: item.quote || '', requestId: item.requestId, documentId,
        meta: item.questionAt ? new Date(item.questionAt).toLocaleString() : '', pending: false
      });
      if (item.answer) this.aiMessages.push({
        id: 'a-' + item.requestId, role: 'assistant', text: item.answer,
        requestId: item.requestId, documentId, engine: item.engine,
        hiddenFromReadingTree: item.hiddenFromReadingTree === true,
        artifacts: item.artifacts || [], progress: item.progress || [],
        meta: '本地历史 · 已归档至阅读工作区', pending: false
      });
    });
    this.aiQuote = '';
    this.aiOccurrence = 0;
    this.aiStart = undefined;
    this._renderAIQuote();
    if (syncComments) this._syncAICommentsFromHistory(documentId, history);
    this._renderAIMessages();
    if (focusRequestId) {
      setTimeout(() => {
        const target = this.aiMessagesRef.current &&
          this.aiMessagesRef.current.querySelector('[data-request-id="' + focusRequestId + '"].ai-message-assistant');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this._flashEl(target);
        }
      }, 30);
    }
  }


  _syncAICommentsFromHistory(documentId, history) {
    let changed = false;
    history.forEach((item) => {
      if (!item.question || !item.quote || this.comments.some((c) => c.requestId === item.requestId)) return;
      this.comments.push({
        id: 'c-history-' + item.requestId,
        quote: item.quote,
        occ: 0,
        type: 'ai',
        note: item.question,
        question: item.question,
        answer: item.answer || '',
        requestId: item.requestId,
        documentId,
        aiStatus: item.answer ? 'answered' : 'pending',
        ts: item.questionAt ? new Date(item.questionAt).getTime() : Date.now()
      });
      changed = true;
    });
    if (changed) {
      this._persist();
      this._renderPreview();
      this._renderComments();
    }
  }


  _renderAIQuote() {
    const el = this.aiQuoteRef.current;
    if (!el) return;
    const context = el.closest && el.closest('.ai-context');
    if (context) context.classList.toggle('has-quote', Boolean(this.aiQuote));
    el.textContent = this.aiQuote || (this.aiMessages.length
      ? '未引用划线内容 · 继续当前对话'
      : '请先在预览中选中文字，再点击「问 AI」。');
    el.classList.toggle('is-empty', !this.aiQuote);
  }


  _consumeAIQuote() {
    this.aiQuote = '';
    this.aiOccurrence = 0;
    this.aiStart = undefined;
    this._renderAIQuote();
  }


  _applyAIDocumentUpdate(data) {
    const source = this.sourceRef.current;
    if (!data || data.documentId !== this.bridgeDocumentId || !source || typeof data.content !== 'string') return false;
    source.value = data.content;
    this._resetEditingHistory();
    this._renderPreview();
    this._updateCount();
    this._setDirty(true);
    this._autosave();
    return true;
  }


  _selectionContext() {
    const full = (this.previewRef.current && this.previewRef.current.textContent) || '';
    if (!this.aiQuote) return '';
    const at = this._nthIndex(full, this.aiQuote, this.aiOccurrence || 0);
    if (at < 0) return '';
    return full.slice(Math.max(0, at - 360), Math.min(full.length, at + this.aiQuote.length + 360));
  }


  askAIQuick(question) {
    const input = this.aiInputRef.current;
    if (!input) return;
    input.value = question;
    input.focus();
  }


  _pushAIMessage(role, text, meta, extra) {
    const message = {
      id: 'm' + Date.now() + Math.floor(Math.random() * 999),
      role,
      text: text || '',
      meta: meta || '',
      pending: role === 'assistant' && !text,
      ...(extra || {})
    };
    this.aiMessages.push(message);
    this._renderAIMessages();
    return message;
  }


  _renderAIMessages() {
    const list = this.aiMessagesRef.current;
    if (!list) return;
    list.innerHTML = '';
    if (!this.aiMessages.length) {
      const empty = document.createElement('div');
      empty.className = 'ai-empty';
      empty.innerHTML = '<span>选择一段原文，然后提出你的疑问。</span><small>回答由所选 AI 渠道（本地 Agent 或 API Key）生成，并归档到阅读工作区。渠道在顶栏「设置」里更换。</small>';
      list.appendChild(empty);
      return;
    }
    this.aiMessages.forEach((message) => {
      const item = document.createElement('article');
      item.className = 'ai-message ai-message-' + message.role + (message.pending ? ' is-pending' : '');
      if (message.requestId) item.setAttribute('data-request-id', message.requestId);
      const label = document.createElement('div');
      label.className = 'ai-message-label';
      label.textContent = message.role === 'user' ? '你' : this._aiEngineLabel(message.engine);
      const body = document.createElement('div');
      body.className = 'ai-message-body';
      if (message.role === 'assistant' && message.text) this._renderSafeMarkdown(body, message.text, message.artifacts);
      else body.textContent = message.text || '正在思考…';
      item.appendChild(label);
      this._appendAIProgress(item, message);
      if (message.quote && message.role === 'user') {
        const quote = document.createElement('blockquote');
        quote.className = 'ai-message-quote';
        quote.textContent = message.quote;
        item.appendChild(quote);
      }
      item.appendChild(body);
      if (message.meta) {
        const meta = document.createElement('small');
        meta.textContent = message.meta;
        item.appendChild(meta);
      }
      this._appendAIRetryAction(item, message);
      this._appendAIReadingTreeAction(item, message);
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }


  _recordAIProgress(message, progress) {
    if (!progress || !progress.label) return;
    if (!Array.isArray(message.progress)) message.progress = [];
    const previous = message.progress[message.progress.length - 1];
    if (previous && previous.label === progress.label && previous.state === progress.state) return;
    message.progress.push({ label: String(progress.label), state: progress.state === 'running' ? 'running' : 'done' });
    if (message.progress.length > 12) message.progress.splice(0, message.progress.length - 12);
  }


  _appendAIProgress(item, message) {
    if (message.role !== 'assistant' || !Array.isArray(message.progress) || !message.progress.length) return;
    const details = document.createElement('details');
    details.className = 'ai-agent-progress';
    details.open = !!message.pending;
    const summary = document.createElement('summary');
    summary.textContent = (message.pending ? '执行中' : '执行过程') + ' · ' + message.progress.length + ' 步';
    const list = document.createElement('ol');
    message.progress.forEach((progress) => {
      const row = document.createElement('li');
      row.className = progress.state === 'running' && message.pending ? 'is-running' : 'is-done';
      row.textContent = progress.label;
      list.appendChild(row);
    });
    details.append(summary, list);
    item.appendChild(details);
  }


  _appendAIRetryAction(item, message) {
    if (message.role !== 'assistant' || !message.failed || !message.retry) return;
    const actions = document.createElement('div');
    actions.className = 'ai-message-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-message-retry';
    button.textContent = message.retrying ? '正在重试…' : (message.retried ? '已重试' : '重试');
    button.disabled = !!(message.retrying || message.retried || this.aiBusy);
    button.addEventListener('click', () => this.retryAIMessage(message.id));
    actions.appendChild(button);
    item.appendChild(actions);
  }


  async retryAIMessage(messageId) {
    if (this.aiBusy) return false;
    const message = this.aiMessages.find((item) => item.id === messageId);
    if (!message || !message.failed || !message.retry || message.retrying || message.retried) return false;
    const retry = message.retry;
    const input = this.aiInputRef.current;
    if (!input) return false;
    message.retrying = true;
    this.aiQuote = retry.quote || '';
    this.aiOccurrence = retry.occurrence || 0;
    this.aiStart = retry.start;
    this.aiEngine = ['codex', 'gemini', 'kimi', 'qwen', 'custom'].includes(retry.engine) ? retry.engine : 'claude';
    input.value = retry.question;
    this._renderAIQuote();
    this._syncAIEngineSwitch();
    this._renderAIMessages();
    let sent = false;
    try {
      sent = await this.sendAIQuestion() !== false;
      return sent;
    } finally {
      message.retrying = false;
      message.retried = sent;
      this._renderAIMessages();
    }
  }


  _aiRetryContext(question) {
    return {
      question,
      quote: this.aiQuote,
      occurrence: this.aiOccurrence || 0,
      start: this.aiStart,
      engine: this.aiEngine
    };
  }


  _matchAIMarkdownArtifact(href, artifacts) {
    if (!href || !Array.isArray(artifacts)) return null;
    const normalized = (value) => {
      try { return decodeURIComponent(String(value)).replace(/^\.\//, ''); } catch { return String(value).replace(/^\.\//, ''); }
    };
    return artifacts.find((item) => normalized(item.href) === normalized(href)) || null;
  }


  async _openAIMarkdownArtifact(documentId) {
    if (!documentId) return;
    await this.openRecentDocument(documentId);
  }


  _renderSafeMarkdown(target, markdown, artifacts) {
    if (!window.marked) {
      target.textContent = markdown;
      return;
    }
    const template = document.createElement('template');
    try {
      template.innerHTML = window.marked.parse ? window.marked.parse(markdown) : window.marked(markdown);
    } catch (e) {
      target.textContent = markdown;
      return;
    }
    template.content.querySelectorAll('script, style, iframe, object, embed, form, input, button, meta, link').forEach((el) => el.remove());
    template.content.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on') || name === 'style' || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
          el.removeAttribute(attr.name);
        }
      });
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
    target.replaceChildren(template.content.cloneNode(true));
    target.querySelectorAll('a').forEach((link) => {
      const artifact = this._matchAIMarkdownArtifact(link.getAttribute('href'), artifacts);
      if (!artifact) return;
      link.removeAttribute('target');
      link.removeAttribute('rel');
      link.setAttribute('href', '#');
      link.classList.add('ai-local-markdown-link');
      link.title = '用墨笺打开 ' + artifact.fileName;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        this._openAIMarkdownArtifact(artifact.documentId);
      });
    });
  }


  _setAIBusy(busy) {
    this.aiBusy = busy;
    const input = this.aiInputRef.current;
    const button = this.aiSendRef.current;
    if (input) input.disabled = busy;
    if (button) {
      button.disabled = busy;
      button.textContent = busy ? '回答中…' : '发送';
    }
  }


  _handleAIStreamEvent(event, data, state) {
    if (event === 'delta' && data?.text) {
      state.assistant.pending = false;
      state.assistant.text += data.text;
      this._renderAIMessages();
    } else if (event === 'progress' && data) {
      this._recordAIProgress(state.assistant, data);
      this._renderAIMessages();
    } else if (event === 'artifacts' && data) {
      state.assistant.artifacts = Array.isArray(data.items) ? data.items : [];
      this._renderAIMessages();
    } else if (event === 'document-updated' && data) {
      state.documentUpdated = this._applyAIDocumentUpdate(data);
      this._renderAIMessages();
    } else if (event === 'usage' && data) {
      const total = Number(data.totalTokens) || (Number(data.inputTokens) || 0) + (Number(data.outputTokens) || 0);
      if (total) {
        const base = state.contextMeta || state.assistant.meta || '';
        state.assistant.meta = base + (base ? ' · ' : '') + total + ' tokens';
        this._renderAIMessages();
      }
    } else if (event === 'meta' && data) {
      state.userMessage.requestId = data.requestId;
      state.userMessage.documentId = data.documentId;
      state.assistant.requestId = data.requestId;
      state.assistant.documentId = data.documentId;
      state.aiComment.requestId = data.requestId;
      state.aiComment.documentId = data.documentId;
      this.bridgeDocumentId = data.documentId;
      this.activeDocumentId = data.documentId;
      this._persist();
      if (data.mode === 'agent') {
        this.agentProjectRoot = data.projectRoot || '';
        state.contextMeta = '已使用项目工具' +
          (data.writeAuthorized ? ' · 已获本次写入权限' : '') +
          (this.agentProjectRoot ? ' · 工程 ' + this.agentProjectRoot : ' · 无工程上下文');
        state.assistant.meta = state.contextMeta + (data.resumed ? ' · 已续接会话' : ' · 已新建会话');
      } else {
        state.contextMeta = '整篇文档已载入' + (data.documentChars ? ' · ' + data.documentChars + ' 字符' : '');
        state.assistant.meta = state.contextMeta + (data.resumed ? ' · 已继续阅读会话' : ' · 已建立阅读会话');
      }
    } else if (event === 'session-reset' && data) {
      this.aiBridgeOnline = true;
      state.userMessage.documentId = data.documentId || state.userMessage.documentId;
      state.assistant.documentId = data.documentId || state.assistant.documentId;
      state.aiComment.documentId = data.documentId || state.aiComment.documentId;
      state.assistant.meta = (state.contextMeta ? state.contextMeta + ' · ' : '') + '历史会话已失效，已自动建立新会话';
      this._setAIStatus('本地 Agent 已连接 · 已重建会话', 'online');
    } else if (event === 'error' && data) {
      throw new Error(data.message || 'Agent 回答失败');
    }
  }


  async sendAIQuestion() {
    if (!this.agentBridgeEnabled) return false;
    if (this.aiBusy) return false;
    const input = this.aiInputRef.current;
    const question = input ? input.value.trim() : '';
    if (!question) return false;
    const requestMode = this._resolveQuestionMode(question);
    if (!requestMode) return false;
    const requestBody = this._aiChatRequestBody(question, requestMode);
    const selectedQuote = this.aiQuote;
    const retryContext = this._aiRetryContext(question);
    const aiComment = {
      id: 'c' + Date.now() + Math.floor(Math.random() * 999),
      quote: selectedQuote,
      occ: this.aiOccurrence || 0,
      start: this.aiStart,
      type: 'ai',
      note: question,
      question,
      answer: '',
      aiStatus: 'pending',
      ts: Date.now()
    };
    if (this.previewOverrideMarkdown && this.activeAnswerRequestId) {
      aiComment.answerRequestId = this.activeAnswerRequestId;
    }
    // 批注靠引用定位，没有引用（Agent 模式直接下指令）就不落批注，只留问答记录。
    const anchored = !!selectedQuote;
    if (anchored) {
      this.comments.push(aiComment);
      this._persist();
      this._renderPreview();
      this._renderComments();
    }
    const engineLabel = this._aiEngineLabel();
    const userMessage = this._pushAIMessage('user', question, '', { quote: selectedQuote });
    const assistant = this._pushAIMessage('assistant', '', '', {
      engine: this.aiEngine, retry: retryContext
    });
    this._consumeAIQuote();
    const streamState = { userMessage, assistant, aiComment, contextMeta: '', documentUpdated: false };
    let bridgeReached = false;
    if (input) input.value = '';
    this._setAIBusy(true);
    this._setAIStatus(engineLabel + (requestMode === 'agent' ? ' 正在使用项目工具…' : ' 正在阅读…'), 'checking');
    try {
      const response = await fetch(bridgeUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok || !response.body) throw new Error('本地 Agent Bridge 无响应');
      bridgeReached = true;
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
          let event = 'message', data = null;
          packet.split('\n').forEach((line) => {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            if (line.startsWith('data:')) {
              try { data = JSON.parse(line.slice(5).trim()); } catch (e) {}
            }
          });
          this._handleAIStreamEvent(event, data, streamState);
        }
      }
      assistant.pending = false;
      assistant.failed = false;
      assistant.meta = (streamState.contextMeta ? streamState.contextMeta + ' · ' : '') +
        (streamState.documentUpdated ? '已更新原文档 · ' : '') + '已归档至阅读工作区';
      this.aiBridgeOnline = true;
      aiComment.answer = assistant.text;
      aiComment.aiStatus = 'answered';
      this._persist();
      this._renderComments();
      this._refreshAIConversations();
      this._refreshRecentDocuments();
      this._setAIStatus('本地 Agent 已连接', 'online');
      this._setStatus(streamState.documentUpdated
        ? 'Agent 已更新原文档并归档回答'
        : 'AI 回答已归档到阅读工作区');
    } catch (error) {
      assistant.pending = false;
      assistant.failed = true;
      const message = error && error.message ? error.message : String(error);
      assistant.text = (bridgeReached ? 'Agent 执行失败：' : '连接失败：') + message;
      assistant.meta = bridgeReached
        ? 'Agent Bridge 已连接，请检查 ' + engineLabel + ' CLI 的会话或运行环境'
        : (window.mojianDesktop ? 'Agent Bridge 未就绪，请重启应用' : '请使用 npm run dev 同时启动前端与 Agent Bridge');
      aiComment.answer = assistant.text;
      aiComment.aiStatus = 'error';
      this._persist();
      this._renderComments();
      this.aiBridgeOnline = bridgeReached;
      this._setAIStatus(bridgeReached ? 'Agent 执行失败' : '本地 Agent 未连接', bridgeReached ? 'online' : 'offline');
    } finally {
      this._setAIBusy(false);
      this._renderAIMessages();
      if (input) input.focus();
    }
    return true;
  }

}
