// @ts-nocheck
import { saveEditorState } from './storage.ts';
import { bridgeUrl } from './bridgeClient.ts';

// 固定文档集按「机器」存本地：多台电脑用途不同，各自挑要固定的文档，不进同步的工作区。
const PINNED_DOCS_KEY = 'md-editor-pinned-docs';
// 汇聚多设备工作区后文档会很多，最近区默认只留这么多，其余折叠，避免列表过长。
const RECENT_VISIBLE_LIMIT = 8;

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


  // 每机本地的固定文档集合（惰性初始化，兼容未经构造器的单测实例）。
  _pinnedSet() {
    if (!(this.pinnedDocumentIds instanceof Set)) this.pinnedDocumentIds = new Set();
    return this.pinnedDocumentIds;
  }

  _loadPinnedIds() {
    this.pinnedDocumentIds = new Set();
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PINNED_DOCS_KEY) : null;
      const ids = raw ? JSON.parse(raw) : [];
      if (Array.isArray(ids)) ids.forEach((id) => { if (typeof id === 'string') this.pinnedDocumentIds.add(id); });
    } catch (e) {}
  }

  _savePinnedIds() {
    try {
      localStorage.setItem(PINNED_DOCS_KEY, JSON.stringify([...this._pinnedSet()]));
    } catch (e) {}
  }

  // 固定 / 取消固定：写本地存储并即时重渲染，不触碰同步的工作区数据。
  togglePinnedDocument(doc) {
    if (!doc || !doc.documentId) return;
    const set = this._pinnedSet();
    if (set.has(doc.documentId)) set.delete(doc.documentId);
    else set.add(doc.documentId);
    this._savePinnedIds();
    this._renderRecentDocuments();
  }

  toggleRecentListExpanded() {
    this.recentListExpanded = !this.recentListExpanded;
    this._renderRecentDocuments();
  }

  // 记住本次会话打开过的文档，让它即使超出最近区上限也保持可见（"新打开的也出现在左侧"）。
  _noteDocumentOpened(documentId) {
    if (!documentId) return;
    if (!(this._sessionOpenedIds instanceof Set)) this._sessionOpenedIds = new Set();
    this._sessionOpenedIds.add(documentId);
    // 打开即展开该文档的追问树，正在读的文档树可见，其余保持收起。
    if (!(this._expandedAnswerDocIds instanceof Set)) this._expandedAnswerDocIds = new Set();
    this._expandedAnswerDocIds.add(documentId);
  }

  _renderRecentDocuments() {
    const list = this.documentListRef.current;
    if (!list) return;
    this._updateFooterPath();
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
    const pinnedSet = this._pinnedSet();
    const pinned = docs.filter((doc) => pinnedSet.has(doc.documentId));
    const rest = docs.filter((doc) => !pinnedSet.has(doc.documentId));
    // 有固定项时才分区标注，否则保持与旧版一致的平铺列表。
    if (pinned.length) {
      list.appendChild(this._recentSectionLabel('已固定', pinned.length));
      pinned.forEach((doc) => list.appendChild(this._recentDocumentGroup(doc, true)));
      if (rest.length) list.appendChild(this._recentSectionLabel('最近', rest.length));
    }
    // 最近区：默认只留最近 N 篇，另加当前打开与本会话开过的，其余折叠。
    const sessionOpened = this._sessionOpenedIds instanceof Set ? this._sessionOpenedIds : new Set();
    const expanded = !!this.recentListExpanded;
    const keep = (doc, index) => index < RECENT_VISIBLE_LIMIT
      || doc.documentId === this.bridgeDocumentId
      || sessionOpened.has(doc.documentId);
    const visible = expanded ? rest : rest.filter(keep);
    visible.forEach((doc) => list.appendChild(this._recentDocumentGroup(doc, false)));
    const hidden = rest.length - visible.length;
    if (hidden > 0 || (expanded && rest.length > RECENT_VISIBLE_LIMIT)) {
      list.appendChild(this._recentListMoreButton(hidden, expanded));
    }
  }

  _recentSectionLabel(text, count) {
    const label = document.createElement('div');
    label.className = 'recent-section-label';
    label.textContent = count ? text + ' · ' + count : text;
    return label;
  }

  _recentListMoreButton(hidden, expanded) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'recent-list-more';
    more.textContent = expanded ? '收起' : ('显示全部 ' + hidden + ' 篇');
    more.addEventListener('click', () => this.toggleRecentListExpanded());
    return more;
  }

  _recentDocumentGroup(doc, isPinned) {
    const group = document.createElement('div');
    group.className = 'recent-document-group' + (isPinned ? ' is-pinned' : '');
    const button = document.createElement('button');
    button.className = 'recent-document-item' +
      (doc.documentId === this.bridgeDocumentId && !this.activeAnswerRequestId ? ' is-active' : '');
    button.type = 'button';
    button.setAttribute('aria-current', doc.documentId === this.bridgeDocumentId ? 'page' : 'false');
    const icon = document.createElement('span');
    // 左侧图标兼作固定态常显指示：固定为 ★，未固定为普通图标，且不与文件名重叠。
    icon.className = 'recent-document-icon' + (isPinned ? ' is-pinned' : '');
    icon.textContent = isPinned ? '★' : '▧';
    const body = document.createElement('span');
    body.className = 'recent-document-body';
    const name = document.createElement('strong');
    name.textContent = doc.fileName;
    name.title = doc.fileName;
    const time = document.createElement('small');
    time.textContent = this._formatRecentTime(doc.updatedAt) +
      ' · ' + (doc.annotationCount || 0) + ' 批注 · ' + (doc.questionCount || 0) + ' 问答';
    body.append(name, time);
    button.append(icon, body);
    button.addEventListener('click', () => this.openRecentDocument(doc.documentId));
    group.appendChild(button);
    // 悬停操作区：右侧渐隐遮罩上排列脉络/删除/固定，避免按钮与文件名糊在一起。
    group.appendChild(this._recentDocumentActions(doc, isPinned));
    const answers = Array.isArray(doc.answerDocuments) ? doc.answerDocuments : [];
    if (answers.length) {
      const expandedTrees = this._expandedAnswerDocIds instanceof Set ? this._expandedAnswerDocIds : new Set();
      const open = expandedTrees.has(doc.documentId);
      group.appendChild(this._answerTreeToggle(doc, answers.length, open));
      if (open) {
        const { roots, byParent } = this._answerTree(answers);
        group.appendChild(this._answerTreeLevel(doc, roots, byParent));
      }
    }
    return group;
  }

  // 悬停操作区：脉络图（有问答时）+ 删除 + 固定；渐隐背景把文件名裁在按钮之前。
  _recentDocumentActions(doc, isPinned) {
    const actions = document.createElement('div');
    actions.className = 'recent-document-actions';
    if (Array.isArray(doc.answerDocuments) && doc.answerDocuments.length) {
      actions.appendChild(this._answerMapButton(doc));
    }
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
    actions.appendChild(remove);
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'recent-document-pin' + (isPinned ? ' is-pinned' : '');
    pin.title = isPinned ? '取消固定' : '固定到列表顶部';
    pin.setAttribute('aria-label', (isPinned ? '取消固定 ' : '固定 ') + doc.fileName);
    pin.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
    pin.textContent = isPinned ? '★' : '☆';
    pin.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.togglePinnedDocument(doc);
    });
    actions.appendChild(pin);
    return actions;
  }

  // 追问树折叠开关：默认收起，仅打开的文档自动展开（见 _noteDocumentOpened），避免长树挤压后续文档。
  _answerTreeToggle(doc, count, open) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'recent-answer-toggle' + (open ? ' is-open' : '');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const caret = document.createElement('span');
    caret.className = 'recent-answer-caret';
    caret.textContent = '▸';
    const label = document.createElement('span');
    label.textContent = count + ' 条追问';
    toggle.append(caret, label);
    toggle.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.toggleAnswerTree(doc.documentId);
    });
    return toggle;
  }

  toggleAnswerTree(documentId) {
    if (!documentId) return;
    if (!(this._expandedAnswerDocIds instanceof Set)) this._expandedAnswerDocIds = new Set();
    if (this._expandedAnswerDocIds.has(documentId)) this._expandedAnswerDocIds.delete(documentId);
    else this._expandedAnswerDocIds.add(documentId);
    this._renderRecentDocuments();
  }

  // 当前文档的本地路径写到底部状态栏（列表项内不再展示，减轻拥挤）。
  _updateFooterPath() {
    const el = this.footerPathRef && this.footerPathRef.current;
    if (!el) return;
    let path = this.localFilePath || '';
    if (!path && this.bridgeDocumentId && Array.isArray(this.recentDocuments)) {
      const doc = this.recentDocuments.find((item) => item.documentId === this.bridgeDocumentId);
      if (doc && doc.localPath) path = doc.localPath;
    }
    el.textContent = path;
    el.title = path ? path + '（点击复制完整路径）' : '';
    if (el.classList) el.classList.toggle('has-path', !!path);
  }

  // 点击底部路径复制完整路径（textContent 始终是完整路径，视觉省略不影响）。
  copyFooterPath() {
    const el = this.footerPathRef && this.footerPathRef.current;
    const path = (el && el.textContent) || this.localFilePath || '';
    if (!path) return;
    this._copy(path, '已复制完整路径');
    if (el && el.classList) {
      el.classList.add('is-copied');
      clearTimeout(this._footerCopyT);
      this._footerCopyT = setTimeout(() => el.classList.remove('is-copied'), 1000);
    }
  }


  // ===== 追问树：子文档按 parentRequestId 逐级嵌套 =====

  // 平铺的子文档列表组装成树；父节点缺失或成环的条目回落为根节点。
  _answerTree(answers) {
    const known = new Set(answers.map((item) => item.requestId));
    const byParent = new Map();
    const roots = [];
    answers.forEach((item) => {
      const pid = item.parentRequestId;
      if (pid && pid !== item.requestId && known.has(pid)) {
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(item);
      } else roots.push(item);
    });
    return { roots, byParent };
  }


  _answerTreeLevel(doc, nodes, byParent, seen = new Set()) {
    const container = document.createElement('div');
    container.className = 'recent-document-children';
    nodes.forEach((answer, index) => {
      if (seen.has(answer.requestId)) return;
      seen.add(answer.requestId);
      container.appendChild(this._answerNode(doc, answer, index === nodes.length - 1));
      const kids = byParent.get(answer.requestId);
      if (kids && kids.length) container.appendChild(this._answerTreeLevel(doc, kids, byParent, seen));
    });
    return container;
  }


  _answerNode(doc, answer, isLast) {
    const row = document.createElement('div');
    row.className = 'recent-answer-row';
    const child = document.createElement('button');
    child.type = 'button';
    child.className = 'recent-answer-item' +
      (doc.documentId === this.bridgeDocumentId && answer.requestId === this.activeAnswerRequestId ? ' is-active' : '');
    child.title = answer.question;
    const branch = document.createElement('span');
    branch.className = 'recent-answer-branch';
    branch.textContent = isLast ? '└' : '├';
    const childBody = document.createElement('span');
    childBody.className = 'recent-answer-body';
    const childName = document.createElement('strong');
    childName.textContent = answer.question;
    const childMeta = document.createElement('small');
    const engineName = ({ codex: 'Codex', gemini: 'Gemini' })[answer.engine] || 'AI';
    const childLabel = answer.kind === 'reply' ? '摘录回答' : engineName + ' 回答';
    childMeta.textContent = childLabel + ' · ' + this._formatRecentTime(answer.updatedAt);
    childBody.append(childName, childMeta);
    child.append(branch, childBody);
    child.addEventListener('click', () => this.openAnswerDocument(doc.documentId, answer.requestId));
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'recent-answer-hide';
    hide.title = '从阅读树移除（保留对话历史）';
    hide.setAttribute('aria-label', '从阅读树移除 ' + answer.question);
    hide.textContent = '−';
    hide.addEventListener('click', (event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.hideAnswerFromTree(doc, answer);
    });
    row.append(child, hide);
    return row;
  }


  async hideAnswerFromTree(doc, answer) {
    if (!doc || !doc.documentId || !answer || !answer.requestId) return;
    const label = answer.question || '该问答';
    if (typeof window !== 'undefined' && window.confirm
      && !window.confirm('从阅读树移除「' + label + '」及其子追问？\n\nAgent 对话历史仍会保留。')) return;
    try {
      const response = await fetch(bridgeUrl('/api/documents/' + encodeURIComponent(doc.documentId)
        + '/answers/' + encodeURIComponent(answer.requestId)), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiddenFromReadingTree: true })
      });
      if (!response.ok) throw new Error('hide failed');
    } catch {
      this._setStatus('移除失败 · Reading Workspace 不可用');
      return;
    }
    const local = Array.isArray(this.comments)
      ? this.comments.find((item) => item.id === answer.requestId || item.requestId === answer.requestId)
      : null;
    if (local) local.hiddenFromReadingTree = true;
    this._setStatus('已从阅读树移除 · 对话历史已保留');
    await this._refreshRecentDocuments();
  }


  _answerMapButton(doc) {
    const map = document.createElement('button');
    map.type = 'button';
    map.className = 'recent-document-map';
    map.title = '查看阅读脉络图';
    map.setAttribute('aria-label', '查看 ' + doc.fileName + ' 的阅读脉络');
    map.textContent = '⌗';
    map.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      this.openReadingMap(doc.documentId);
    });
    return map;
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
      // 挂起的防抖同步一并取消，否则计时器触发会把刚删除的文档重新写回工作区。
      clearTimeout(this._bridgeSyncT);
      this._bridgeSyncT = null;
      this.bridgeDocumentId = null;
      this.activeDocumentId = null;
      this.previewOverrideMarkdown = '';
      this.activeAnswerRequestId = null;
      if (typeof this._renderPreview === 'function') this._renderPreview();
    }
    this._setStatus('已从最近阅读删除 · ' + label);
    await this._refreshRecentDocuments();
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
      await this._flushBridgeSync();
      const response = await fetch(bridgeUrl('/api/documents/') + encodeURIComponent(documentId));
      if (!response.ok) throw new Error('文档读取失败');
      const data = await response.json();
      const doc = data.document;
      this.bridgeDocumentId = doc.documentId;
      this.activeDocumentId = doc.documentId;
      this.activeAnswerRequestId = null;
      this._noteDocumentOpened(doc.documentId);
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
      // 子节点也可能是用户贴在批注下的摘录回答，此时 requestId 是批注 id。
      const reply = (item && item.answer) ? null : (doc.annotations || [])
        .find((annotation) => annotation.id === requestId && annotation.reply && String(annotation.reply).trim());
      if ((!item || !item.answer) && !reply) throw new Error('这条问答还没有回答结果');
      this.bridgeDocumentId = documentId;
      this.activeDocumentId = documentId;
      this.activeAnswerRequestId = requestId;
      this._noteDocumentOpened(documentId);
      const trail = this._answerTrail(doc, requestId);
      this.previewOverrideMarkdown = reply
        ? this._answerMarkdown(doc, { quote: reply.quote, question: reply.note || reply.question, answer: reply.reply }, '摘录回答', trail)
        : this._answerMarkdown(doc, item, 'AI 问答', trail);
      this.viewMode = 'preview';
      this._syncViewMode();
      this._renderPreview();
      this._renderRecentDocuments();
      this._setStatus(reply
        ? '正在阅读摘录回答 · ' + this._crumbLabel(reply.note || '未命名想法')
        : '正在阅读 AI 问答 · ' + this._crumbLabel(item.question || '未命名问题'));
      this.closeDocumentSidebar();
    } catch (error) {
      this._setStatus(error.message || 'AI 问答读取失败');
    }
  }


  // 从当前子文档回溯到根，输出沿途的问题标签（不含当前节点自身）。
  // 父指针：消息用 parentRequestId，批注用 answerRequestId（创建它的那个子文档视图）。
  _answerTrail(doc, requestId) {
    const messages = Array.isArray(doc.messages) ? doc.messages : [];
    const annotations = Array.isArray(doc.annotations) ? doc.annotations : [];
    const parentOf = (id) => {
      const message = messages.find((m) => m.requestId === id);
      if (message) return message.parentRequestId;
      const annotation = annotations.find((a) => a.id === id);
      return annotation && annotation.answerRequestId;
    };
    const labelOf = (id) => {
      const message = messages.find((m) => m.requestId === id);
      if (message) return message.question;
      const annotation = annotations.find((a) => a.id === id);
      return annotation && (annotation.note || annotation.question);
    };
    const trail = [];
    const seen = new Set([requestId]);
    let current = parentOf(requestId);
    while (current && !seen.has(current)) {
      seen.add(current);
      trail.unshift(labelOf(current) || '未命名问题');
      current = parentOf(current);
    }
    return trail;
  }


  _crumbLabel(label) {
    const text = String(label || '').replace(/\s+/g, ' ').trim();
    return text.length > 24 ? text.slice(0, 24) + '…' : text;
  }


  _answerMarkdown(doc, item, heading = 'AI 问答', trail = []) {
    const quote = String(item.quote || '').trim();
    const crumbs = ['来源：' + (doc.fileName || doc.title || '未命名文档')]
      .concat(trail.map((label) => this._crumbLabel(label)));
    const parts = [
      '# ' + heading,
      '> ' + crumbs.join(' › ')
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
        reply: item.reply || '',
        replyAt: item.replyAt,
        answerRequestId: item.answerRequestId || undefined,
        hiddenFromReadingTree: item.hiddenFromReadingTree === true,
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
      longImageWidth: this.longImageWidth || undefined,
      longImageMarks: this.longImageMarks === false ? false : undefined,
      comments: this.comments,
      bridgeDocumentId: this.bridgeDocumentId || undefined,
      aiEngine: (this.aiEngine && this.aiEngine !== 'claude') ? this.aiEngine : undefined,
      savedAt
    });
    if (syncBridge && this.agentBridgeEnabled) this._scheduleBridgeSync();
  }


  _scheduleBridgeSync() {
    if (!this.sourceRef.current || !this.fileName || this.fileName === '未命名.md') return;
    clearTimeout(this._bridgeSyncT);
    this._bridgeSyncT = setTimeout(() => {
      this._bridgeSyncT = null;
      this._syncDocumentToBridge();
    }, 800);
  }


  // 还在防抖等待中的变更立即落盘。openRecentDocument 会用 bridge 数据整体重建
  // comments，不先冲刷的话，这 800ms 窗口里新写的批注/回复会被覆盖丢失。
  async _flushBridgeSync() {
    if (!this._bridgeSyncT) return;
    clearTimeout(this._bridgeSyncT);
    this._bridgeSyncT = null;
    await this._syncDocumentToBridge();
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
