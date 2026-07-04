// @ts-nocheck

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


  _initAI() {
    if (!this.agentBridgeEnabled) return;
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
      const response = await fetch('http://127.0.0.1:4317/health', {
        signal: AbortSignal.timeout ? AbortSignal.timeout(1800) : undefined
      });
      if (!response.ok) throw new Error('Bridge unavailable');
      this.aiBridgeOnline = true;
      this._setAIStatus('Claude Code 已连接', 'online');
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
      const response = await fetch('http://127.0.0.1:4317/api/history', {
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
      const response = await fetch('http://127.0.0.1:4317/api/conversations');
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
      const response = await fetch('http://127.0.0.1:4317/api/conversations/' + encodeURIComponent(documentId));
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
        requestId: item.requestId, documentId,
        meta: '本地历史 · 已归档至 Brain OS', pending: false
      });
    });
    const lastQuote = history.length ? history[history.length - 1].quote : '';
    if (lastQuote) { this.aiQuote = lastQuote; this._renderAIQuote(); }
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
    el.textContent = this.aiQuote || '请先在预览中选中文字，再点击「问 AI」。';
    el.classList.toggle('is-empty', !this.aiQuote);
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
      empty.innerHTML = '<span>选择一段原文，然后提出你的疑问。</span><small>回答会由本机 Claude Code 生成，并归档到 Brain OS。</small>';
      list.appendChild(empty);
      return;
    }
    this.aiMessages.forEach((message) => {
      const item = document.createElement('article');
      item.className = 'ai-message ai-message-' + message.role + (message.pending ? ' is-pending' : '');
      if (message.requestId) item.setAttribute('data-request-id', message.requestId);
      const label = document.createElement('div');
      label.className = 'ai-message-label';
      label.textContent = message.role === 'user' ? '你' : 'Claude';
      const body = document.createElement('div');
      body.className = 'ai-message-body';
      if (message.role === 'assistant' && message.text) this._renderSafeMarkdown(body, message.text);
      else body.textContent = message.text || '正在思考…';
      item.appendChild(label);
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
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }


  _renderSafeMarkdown(target, markdown) {
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


  async sendAIQuestion() {
    if (!this.agentBridgeEnabled) return;
    if (this.aiBusy) return;
    const input = this.aiInputRef.current;
    const question = input ? input.value.trim() : '';
    if (!question) return;
    if (!this.aiQuote) {
      this._setAIStatus('请先选择一段原文', 'offline');
      return;
    }

    const aiComment = {
      id: 'c' + Date.now() + Math.floor(Math.random() * 999),
      quote: this.aiQuote,
      occ: this.aiOccurrence || 0,
      start: this.aiStart,
      type: 'ai',
      note: question,
      question,
      answer: '',
      aiStatus: 'pending',
      ts: Date.now()
    };
    this.comments.push(aiComment);
    this._persist();
    this._renderPreview();
    this._renderComments();
    const userMessage = this._pushAIMessage('user', question, '', { quote: this.aiQuote });
    const assistant = this._pushAIMessage('assistant', '');
    let bridgeReached = false;
    if (input) input.value = '';
    this._setAIBusy(true);
    this._setAIStatus('Claude 正在阅读…', 'checking');

    try {
      const response = await fetch('http://127.0.0.1:4317/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          document: this._documentPayload(),
          selection: {
            quote: this.aiQuote,
            occurrence: this.aiOccurrence || 0,
            surroundingText: this._selectionContext()
          }
        })
      });
      if (!response.ok || !response.body) throw new Error('本地 Agent Bridge 无响应');
      bridgeReached = true;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let contextMeta = '';
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
          if (event === 'delta' && data && data.text) {
            assistant.pending = false;
            assistant.text += data.text;
            this._renderAIMessages();
          } else if (event === 'meta' && data) {
            userMessage.requestId = data.requestId;
            userMessage.documentId = data.documentId;
            assistant.requestId = data.requestId;
            assistant.documentId = data.documentId;
            aiComment.requestId = data.requestId;
            aiComment.documentId = data.documentId;
            this.bridgeDocumentId = data.documentId;
            this.activeDocumentId = data.documentId;
            this._persist();
            contextMeta = '整篇文档已载入' + (data.documentChars ? ' · ' + data.documentChars + ' 字符' : '');
            assistant.meta = contextMeta + (data.resumed ? ' · 已继续阅读会话' : ' · 已建立阅读会话');
          } else if (event === 'session-reset' && data) {
            this.aiBridgeOnline = true;
            userMessage.documentId = data.documentId || userMessage.documentId;
            assistant.documentId = data.documentId || assistant.documentId;
            aiComment.documentId = data.documentId || aiComment.documentId;
            assistant.meta = (contextMeta ? contextMeta + ' · ' : '') + '历史会话已失效，已自动建立新会话';
            this._setAIStatus('Claude Code 已连接 · 已重建会话', 'online');
          } else if (event === 'error' && data) {
            throw new Error(data.message || 'Agent 回答失败');
          }
        }
      }
      assistant.pending = false;
      assistant.meta = (contextMeta ? contextMeta + ' · ' : '') + '已归档至 Brain OS';
      this.aiBridgeOnline = true;
      aiComment.answer = assistant.text;
      aiComment.aiStatus = 'answered';
      this._persist();
      this._renderComments();
      this._refreshAIConversations();
      this._refreshRecentDocuments();
      this._setAIStatus('Claude Code 已连接', 'online');
      this._setStatus('AI 回答已保存到 Reading Workspace');
    } catch (error) {
      assistant.pending = false;
      const message = error && error.message ? error.message : String(error);
      assistant.text = (bridgeReached ? 'Agent 执行失败：' : '连接失败：') + message;
      assistant.meta = bridgeReached
        ? 'Agent Bridge 已连接，请检查 Claude Code 的会话或运行环境'
        : '请使用 npm run dev 同时启动前端与 Agent Bridge';
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
  }

}
