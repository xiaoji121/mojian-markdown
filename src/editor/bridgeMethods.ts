// @ts-nocheck
import { saveEditorState } from './storage';

export class BridgeMethods {
  _formatRecentTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return '昨天';
    if (date.getFullYear() === now.getFullYear()) return (date.getMonth() + 1) + '月' + date.getDate() + '日';
    return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
  }


  _renderRecentDocuments() {
    const list = this.documentListRef.current;
    if (!list) return;
    list.innerHTML = '';
    const docs = [...this.recentDocuments].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (this.documentCountRef.current) this.documentCountRef.current.textContent = String(docs.length);
    if (!docs.length) {
      const empty = document.createElement('div');
      empty.className = 'recent-documents-empty';
      empty.textContent = 'Agent Bridge 未启动，或 Reading Workspace 中还没有文档。';
      list.appendChild(empty);
      return;
    }
    docs.forEach((doc) => {
      const group = document.createElement('div');
      group.className = 'recent-document-group';
      const button = document.createElement('button');
      button.className = 'recent-document-item' +
        (doc.documentId === this.bridgeDocumentId && !this.activeAnswerRequestId ? ' is-active' : '');
      button.type = 'button';
      button.title = doc.fileName;
      button.setAttribute('aria-current', doc.documentId === this.bridgeDocumentId ? 'page' : 'false');
      const icon = document.createElement('span');
      icon.className = 'recent-document-icon';
      icon.textContent = '▧';
      const body = document.createElement('span');
      body.className = 'recent-document-body';
      const name = document.createElement('strong');
      name.textContent = doc.fileName;
      const time = document.createElement('small');
      time.textContent = this._formatRecentTime(doc.updatedAt) +
        ' · ' + (doc.annotationCount || 0) + ' 批注 · ' + (doc.questionCount || 0) + ' 问答';
      body.append(name, time);
      button.append(icon, body);
      button.addEventListener('click', () => this.openRecentDocument(doc.documentId));
      group.appendChild(button);
      const answers = Array.isArray(doc.answerDocuments) ? doc.answerDocuments : [];
      if (answers.length) {
        const children = document.createElement('div');
        children.className = 'recent-document-children';
        answers.forEach((answer, index) => {
          const child = document.createElement('button');
          child.type = 'button';
          child.className = 'recent-answer-item' +
            (doc.documentId === this.bridgeDocumentId && answer.requestId === this.activeAnswerRequestId ? ' is-active' : '');
          child.title = answer.question;
          const branch = document.createElement('span');
          branch.className = 'recent-answer-branch';
          branch.textContent = index === answers.length - 1 ? '└' : '├';
          const childBody = document.createElement('span');
          childBody.className = 'recent-answer-body';
          const childName = document.createElement('strong');
          childName.textContent = answer.question;
          const childMeta = document.createElement('small');
          childMeta.textContent = 'AI 回答 · ' + this._formatRecentTime(answer.updatedAt);
          childBody.append(childName, childMeta);
          child.append(branch, childBody);
          child.addEventListener('click', () => this.openAnswerDocument(doc.documentId, answer.requestId));
          children.appendChild(child);
        });
        group.appendChild(children);
      }
      list.appendChild(group);
    });
  }


  async _refreshRecentDocuments() {
    try {
      const response = await fetch('http://127.0.0.1:4317/api/documents');
      if (!response.ok) throw new Error('Reading Workspace unavailable');
      const data = await response.json();
      this.recentDocuments = Array.isArray(data.documents) ? data.documents : [];
      if (!this.bridgeDocumentId && this.fileName && this.fileName !== '未命名.md') {
        const sameName = this.recentDocuments.filter((doc) => doc.fileName === this.fileName);
        const preferred = sameName.find((doc) => doc.questionCount > 0) || sameName[0];
        if (preferred) {
          this.bridgeDocumentId = preferred.documentId;
          this.activeDocumentId = preferred.documentId;
          this._persist(false);
        }
      }
    } catch {
      this.recentDocuments = [];
    }
    this._renderRecentDocuments();
  }


  async openRecentDocument(documentId) {
    if (!this.sourceRef.current) return;
    try {
      const response = await fetch('http://127.0.0.1:4317/api/documents/' + encodeURIComponent(documentId));
      if (!response.ok) throw new Error('文档读取失败');
      const data = await response.json();
      const doc = data.document;
      this.bridgeDocumentId = doc.documentId;
      this.activeDocumentId = doc.documentId;
      this.activeAnswerRequestId = null;
      this.previewOverrideMarkdown = '';
      this.fileHandle = null;
      this.sourceRef.current.value = this._cleanOpenedMarkdown(doc.content || '');
      this.comments = this._commentsFromBridge(doc.annotations || [], doc.messages || [], doc.documentId);
      this._setFileName(doc.fileName || doc.title || '未命名.md');
      this._showConversationMessages(doc.documentId, doc.messages || [], null, false);
      this._renderComments();
      this._renderPreview();
      this._setDirty(false);
      this._persist();
      this._renderRecentDocuments();
      this._setStatus('已从 Reading Workspace 打开 · ' + this.fileName);
      this.closeDocumentSidebar();
    } catch (error) {
      this._setStatus(error.message || 'Reading Workspace 文档读取失败');
    }
  }


  async openAnswerDocument(documentId, requestId) {
    try {
      const response = await fetch('http://127.0.0.1:4317/api/documents/' + encodeURIComponent(documentId));
      if (!response.ok) throw new Error('问答读取失败');
      const data = await response.json();
      const doc = data.document;
      const item = (doc.messages || []).find((message) => message.requestId === requestId);
      if (!item || !item.answer) throw new Error('这条问答还没有回答结果');
      this.bridgeDocumentId = documentId;
      this.activeDocumentId = documentId;
      this.activeAnswerRequestId = requestId;
      this.previewOverrideMarkdown = this._answerMarkdown(doc, item);
      this.viewMode = 'preview';
      this._syncViewMode();
      this._renderPreview();
      this._renderRecentDocuments();
      this._setStatus('正在阅读 AI 问答 · ' + (item.question || '未命名问题'));
      this.closeDocumentSidebar();
    } catch (error) {
      this._setStatus(error.message || 'AI 问答读取失败');
    }
  }


  _answerMarkdown(doc, item) {
    const quote = String(item.quote || '').trim();
    const parts = [
      '# AI 问答',
      `> 来源：${doc.fileName || doc.title || '未命名文档'}`
    ];
    if (quote) parts.push('> ' + quote.replace(/\n/g, '\n> '));
    parts.push('## 问题', item.question || '', '## 回答', item.answer || '');
    return parts.join('\n\n');
  }


  _commentsFromBridge(annotations, messages, documentId) {
    const byRequest = new Map(messages.map((item) => [item.requestId, item]));
    return annotations.map((item) => {
      const history = byRequest.get(item.requestId || item.id);
      const question = item.question || history?.question || '';
      const answer = item.answer || history?.answer || '';
      return {
        id: item.id || ('c-bridge-' + Math.random().toString(36).slice(2)),
        quote: item.quote || '',
        occ: item.occ ?? item.occurrence ?? 0,
        start: item.start,
        type: item.type || (question ? 'ai' : 'idea'),
        note: item.note || question,
        question,
        answer,
        requestId: item.requestId || item.id || '',
        documentId,
        aiStatus: question ? (answer ? 'answered' : 'pending') : undefined,
        ts: typeof item.ts === 'number' ? item.ts : new Date(item.ts || Date.now()).getTime()
      };
    });
  }


  toggleDocumentSidebar() {
    const sidebar = this.documentSidebarRef.current;
    if (!sidebar) return;
    sidebar.classList.toggle('is-mobile-open');
  }


  closeDocumentSidebar() {
    const sidebar = this.documentSidebarRef.current;
    if (sidebar) sidebar.classList.remove('is-mobile-open');
  }

  // ===== double-click anchoring =====

  _persist(syncBridge = true) {
    const src = this.sourceRef.current;
    saveEditorState({
      content: src ? src.value : '',
      fileName: this.fileName,
      fontSize: this.fontSize,
      theme: this.theme,
      comments: this.comments,
      bridgeDocumentId: this.bridgeDocumentId || undefined
    });
    if (syncBridge && this.agentBridgeEnabled) this._scheduleBridgeSync();
  }


  _scheduleBridgeSync() {
    if (!this.sourceRef.current || !this.fileName || this.fileName === '未命名.md') return;
    clearTimeout(this._bridgeSyncT);
    this._bridgeSyncT = setTimeout(() => this._syncDocumentToBridge(), 800);
  }


  async _syncDocumentToBridge() {
    try {
      const response = await fetch('http://127.0.0.1:4317/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: this._documentPayload(),
          annotations: this.comments.filter((comment) => comment.type !== 'ai')
        })
      });
      if (!response.ok) return;
      const data = await response.json();
      this.bridgeDocumentId = data.documentId;
      this.activeDocumentId = data.documentId;
      this._refreshRecentDocuments();
    } catch {}
  }


  _documentPayload() {
    const src = this.sourceRef.current;
    return {
      sourceApp: 'markdown-editor',
      title: this.fileName || '未命名文档',
      fileName: this.fileName || '未命名.md',
      content: src ? src.value : '',
      documentId: this.bridgeDocumentId || undefined
    };
  }

}
