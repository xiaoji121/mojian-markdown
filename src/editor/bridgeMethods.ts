// @ts-nocheck
import { saveEditorState } from './storage.ts';
import { bridgeUrl } from './bridgeClient.ts';

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
    // 重渲染会移走被悬停的元素，mouseleave 不再触发，先行收起浮层。
    this._hidePathTooltip();
    if (!this._pathTooltipScrollBound && list.addEventListener) {
      list.addEventListener('scroll', () => this._hidePathTooltip());
      this._pathTooltipScrollBound = true;
    }
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
      button.setAttribute('aria-current', doc.documentId === this.bridgeDocumentId ? 'page' : 'false');
      const icon = document.createElement('span');
      icon.className = 'recent-document-icon';
      icon.textContent = '▧';
      const body = document.createElement('span');
      body.className = 'recent-document-body';
      const name = document.createElement('strong');
      name.textContent = doc.fileName;
      name.title = doc.fileName;
      const time = document.createElement('small');
      time.textContent = this._formatRecentTime(doc.updatedAt) +
        ' · ' + (doc.annotationCount || 0) + ' 批注 · ' + (doc.questionCount || 0) + ' 问答';
      body.append(name, time);
      if (doc.localPath) {
        const path = document.createElement('small');
        path.className = 'recent-document-path';
        path.textContent = doc.localPath;
        // 路径被 CSS 截断，悬停即刻弹出完整路径（原生 title 延迟高且不醒目）。
        path.addEventListener('mouseenter', () => this._showPathTooltip(path, doc.localPath));
        path.addEventListener('mouseleave', () => this._hidePathTooltip());
        body.appendChild(path);
      }
      button.append(icon, body);
      button.addEventListener('click', () => this.openRecentDocument(doc.documentId));
      group.appendChild(button);
      // 删除按钮不能嵌进 item button（button 不可嵌套），做成组内绝对定位的兄弟节点。
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'recent-document-delete';
      remove.title = '从最近阅读中删除';
      remove.setAttribute('aria-label', '删除 ' + doc.fileName);
      remove.textContent = '×';
      remove.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.deleteRecentDocument(doc);
      });
      group.appendChild(remove);
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
          childMeta.textContent = (answer.engine === 'codex' ? 'Codex' : 'AI') + ' 回答 · ' + this._formatRecentTime(answer.updatedAt);
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


  async deleteRecentDocument(doc) {
    if (!doc || !doc.documentId) return;
    const label = doc.fileName || '该文档';
    if (typeof window !== 'undefined' && window.confirm
      && !window.confirm('从最近阅读中删除「' + label + '」？其批注与 AI 问答记录将一并删除。')) return;
    try {
      const response = await fetch(
        bridgeUrl('/api/documents/' + encodeURIComponent(doc.documentId)),
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('delete failed');
    } catch {
      this._setStatus('删除失败 · Reading Workspace 不可用');
      return;
    }
    if (this.bridgeDocumentId === doc.documentId) {
      // 被删的是当前文档：只解除工作区关联，编辑器内容保持不动；继续编辑会重新登记。
      this.bridgeDocumentId = null;
      this.activeDocumentId = null;
      this.previewOverrideMarkdown = '';
      this.activeAnswerRequestId = null;
      if (typeof this._renderPreview === 'function') this._renderPreview();
    }
    this._setStatus('已从最近阅读删除 · ' + label);
    await this._refreshRecentDocuments();
  }


  // ===== 完整路径悬停浮层（单例，挂 body 上避免被侧栏滚动容器裁剪） =====

  _showPathTooltip(anchor, text) {
    if (!document.body) return;
    let tip = this._pathTooltipEl;
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'path-tooltip';
      document.body.appendChild(tip);
      this._pathTooltipEl = tip;
    }
    tip.textContent = text;
    tip.classList.add('is-visible');
    this._positionPathTooltip(tip, anchor);
  }


  _positionPathTooltip(tip, anchor) {
    if (!anchor.getBoundingClientRect || typeof window === 'undefined' || !tip.style) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    tip.style.maxWidth = Math.min(440, window.innerWidth - margin * 2) + 'px';
    // 先落位再测量，宽高确定后按视口收拢；底部放不下时翻到锚点上方。
    tip.style.left = '0px';
    tip.style.top = '0px';
    const width = tip.offsetWidth || 0;
    const height = tip.offsetHeight || 0;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    let top = rect.bottom + 6;
    if (top + height + margin > window.innerHeight) top = rect.top - height - 6;
    tip.style.left = left + 'px';
    tip.style.top = Math.max(margin, top) + 'px';
  }


  _hidePathTooltip() {
    if (this._pathTooltipEl) this._pathTooltipEl.classList.remove('is-visible');
  }


  _disposePathTooltip() {
    if (this._pathTooltipEl && this._pathTooltipEl.remove) this._pathTooltipEl.remove();
    this._pathTooltipEl = null;
  }


  async _refreshRecentDocuments() {
    try {
      const response = await fetch(bridgeUrl('/api/documents'));
      if (!response.ok) throw new Error('Reading Workspace unavailable');
      const data = await response.json();
      this.recentDocuments = Array.isArray(data.documents) ? data.documents : [];
      if (!this.bridgeDocumentId && this.fileName && this.fileName !== '未命名.md') {
        const preferred = this._matchRecentDocumentByName(this.fileName);
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


  // 桌面端由内嵌 bridge 托管、端口每次启动随机，localStorage 按源隔离，
  // 重启后草稿状态必然为空、只能落到示例文档。此时若工作区已有最近阅读，
  // 直接恢复最近更新的一篇；示例文档只留给还没有任何记录的全新用户。
  async _maybeOpenLatestRecentDocument() {
    if (!this._startedWithSample || this.dirty || this.fileHandle) return;
    if (this.bridgeDocumentId || this.fileName !== '未命名.md') return;
    if (!this.recentDocuments.length) return;
    const latest = [...this.recentDocuments]
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    this._startedWithSample = false;
    await this.openRecentDocument(latest.documentId);
    this._setStatus('已恢复最近阅读 · ' + this.fileName);
  }


  _matchRecentDocumentByName(fileName) {
    const sameName = this.recentDocuments.filter((doc) => doc.fileName === fileName);
    return sameName.find((doc) => doc.questionCount > 0) || sameName[0] || null;
  }


  // 打开本地文件时认领 Reading Workspace 里的同名文档：复用其 documentId，
  // 恢复批注与问答，避免每次打开都生成一份新副本。
  async _adoptBridgeDocument(fileName) {
    if (!this.agentBridgeEnabled || !fileName || fileName === '未命名.md') return null;
    try {
      const response = await fetch(bridgeUrl('/api/documents'));
      if (!response.ok) return null;
      const data = await response.json();
      this.recentDocuments = Array.isArray(data.documents) ? data.documents : [];
      const preferred = this._matchRecentDocumentByName(fileName);
      if (!preferred) return null;
      const detail = await fetch(bridgeUrl('/api/documents/') + encodeURIComponent(preferred.documentId));
      if (!detail.ok) return null;
      const doc = (await detail.json()).document;
      this.bridgeDocumentId = doc.documentId;
      this.activeDocumentId = doc.documentId;
      this.comments = this._commentsFromBridge(doc.annotations || [], doc.messages || [], doc.documentId);
      this._renderRecentDocuments();
      return doc;
    } catch {
      return null;
    }
  }


  async openRecentDocument(documentId) {
    if (!this.sourceRef.current) return;
    try {
      const response = await fetch(bridgeUrl('/api/documents/') + encodeURIComponent(documentId));
      if (!response.ok) throw new Error('文档读取失败');
      const data = await response.json();
      const doc = data.document;
      this.bridgeDocumentId = doc.documentId;
      this.activeDocumentId = doc.documentId;
      this.activeAnswerRequestId = null;
      this.previewOverrideMarkdown = '';
      this._detachLocalFile();
      this.sourceRef.current.value = this._cleanOpenedMarkdown(doc.content || '');
      this._resetEditingHistory();
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
      // 若之前打开过同名本地文件，重新接上句柄；本地文件内容优先于工作区副本。
      await this._reattachLocalFileForDocument(doc);
      // localFilePath 到这里才可用；内容与磁盘一致时上面不会再重渲染，
      // 需要在此补齐相对路径图片的替换。
      this._hydrateLocalImages(this.previewRef.current);
    } catch (error) {
      this._setStatus(error.message || 'Reading Workspace 文档读取失败');
    }
  }


  async openAnswerDocument(documentId, requestId) {
    try {
      const response = await fetch(bridgeUrl('/api/documents/') + encodeURIComponent(documentId));
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
    const savedAt = Date.now();
    this._draftSavedAt = savedAt;
    saveEditorState({
      content: src ? src.value : '',
      fileName: this.fileName,
      fontSize: this.fontSize,
      theme: this.theme,
      paperDark: this.paperDark || undefined,
      paperLight: this.paperLight || undefined,
      immersiveWide: this.immersiveWide || undefined,
      comments: this.comments,
      bridgeDocumentId: this.bridgeDocumentId || undefined,
      aiEngine: this.aiEngine === 'codex' ? 'codex' : undefined,
      savedAt
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
      const response = await fetch(bridgeUrl('/api/documents'), {
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
      localPath: this.localFilePath || undefined,
      content: src ? src.value : '',
      documentId: this.bridgeDocumentId || undefined
    };
  }

}
