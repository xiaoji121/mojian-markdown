// @ts-nocheck
import { t } from './i18n.ts';

export function filterWorkspaceDocuments(documents, query = '') {
  const term = query.trim().normalize('NFKC').toLocaleLowerCase();
  return documents.filter(doc => String(doc.fileName || '').normalize('NFKC').toLocaleLowerCase().includes(term));
}

export class WorkspaceNavigationMethods {
  _initWorkspaceNavigation() {
    this._syncDocumentSidebar();
    this._initDocumentSidebarResize();
    this._syncExportMenuCapabilities?.();
    this._syncOpenDocLabel?.();
    this._syncPersistentStatus?.();
    this._workspaceResize = () => {
      this._syncDocumentSidebar();
      this._syncWorkspacePanelWidth();
    };
    window.addEventListener('resize', this._workspaceResize);
    this._syncWorkspaceChrome();
    if (!this.agentBridgeEnabled) this._renderRecentDocuments();
    this._workspaceTabKey = event => {
      const tab = event.target.closest?.('.assistance-tabs [role="tab"]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const order = ['comments', 'outline', ...(this.agentBridgeEnabled ? ['ai'] : [])];
      let index = this.aiPanelOpen ? order.indexOf('ai')
        : this.outlinePanelOpen ? order.indexOf('outline')
        : 0;
      if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = order.length - 1;
      else if (event.key === 'ArrowRight') index = Math.min(order.length - 1, index + 1);
      else index = Math.max(0, index - 1);
      const next = order[index];
      if (next === 'ai') this._openAIPanel(true);
      else if (next === 'outline') this._openOutlinePanel(true);
      else this._openPanel(true);
      const panel = this.aiPanelOpen ? this.aiPanelRef.current
        : this.outlinePanelOpen ? this.outlineSidebarRef?.current
        : this.commentsRef.current;
      panel?.querySelector('[aria-selected="true"]')?.focus();
    };
    document.addEventListener('keydown', this._workspaceTabKey);
  }

  _workspaceNavigationRenderVals() {
    return {
      filterDocuments: event => {
        this.workspaceDocumentQuery = event.target.value;
        this._renderRecentDocuments();
      },
      showCommentsTab: () => this._openPanel(true),
      showOutlineTab: () => this._openOutlinePanel(true),
      showAITab: () => this._openAIPanel(true)
    };
  }

  _syncWorkspaceChrome() {
    const shell = this.splitRef?.current?.closest?.('.app-shell');
    shell?.classList.toggle('has-assistance', !!(this.panelOpen || this.aiPanelOpen || this.outlinePanelOpen));
    shell?.querySelectorAll('.assistance-count').forEach(node => { node.textContent = String(this.comments.length); });
    const aiWeak = shell?.querySelector?.('.app-header .ai-entry-weak');
    if (aiWeak && !this.agentBridgeEnabled && typeof aiWeak.setAttribute === 'function') {
      aiWeak.setAttribute('data-optional-label', t('可选'));
      aiWeak.title = t('可选') + ' · ' + t('AI 与文档历史需要桌面版或本地 Agent Bridge。');
    }
    // 静态：选区「问 AI」/翻译不挂可见 DOM（hidden，非仅 CSS）；Bridge 在线再显示
    const doc = typeof document !== 'undefined' ? document : null;
    doc?.querySelectorAll?.('.selection-toolbar .ai-entry, .selection-toolbar .translate-entry')?.forEach((el) => {
      el.hidden = !this.agentBridgeEnabled;
    });
    doc?.querySelectorAll?.('.assistance-tabs .ai-entry')?.forEach((el) => {
      el.hidden = !this.agentBridgeEnabled;
    });
    const status = shell?.querySelector('.workspace-save-label');
    if (status) {
      const hasFile = !!(this.fileHandle || this.localFilePath);
      // Browser autosave and “save to file” are different. Without a file, say
      // the draft is browser-only so the badge does not fight the footer.
      status.textContent = t(
        this._localFileConflict ? '文件冲突'
          : hasFile ? (this.dirty ? '未写回文件' : '已保存')
          : '仅浏览器草稿'
      );
      status.title = t(
        this._localFileConflict ? '文件冲突'
          : hasFile
          ? (this.dirty ? '已改动，尚未写回打开的文件' : '已与打开的文件同步')
          : '草稿仅存此浏览器，清除缓存会丢失；请用导出下载全文+批注备份'
      );
    }
  }

  _renderLocalWorkspaceDocument(list) {
    const row = document.createElement('button');
    row.className = 'recent-document-item is-active';
    row.textContent = this.fileName || t('未命名.md');
    row.addEventListener('click', () => { this.setViewMode('preview'); });
    if (filterWorkspaceDocuments([{ fileName: row.textContent }], this.workspaceDocumentQuery).length) list.appendChild(row);
    else {
      const empty = document.createElement('p');
      empty.className = 'recent-documents-empty';
      empty.textContent = t('没有匹配的文档');
      list.appendChild(empty);
    }
    const mode = document.createElement('p');
    mode.className = 'workspace-local-note workspace-trial-mode';
    mode.textContent = t('浏览器试用模式');
    list.appendChild(mode);
    const note = document.createElement('p');
    note.className = 'workspace-local-note';
    note.textContent = t('跨文档历史需桌面版');
    list.appendChild(note);
  }


  _appendRecentReconnect(list) {
    if (!list || list.querySelector('.recent-reconnect')) return;
    // 非首屏主按钮：次要文字链，收在列表底部
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'recent-reconnect recent-reconnect-link';
    action.textContent = t('重新连接');
    action.title = t('尝试连接本机 Agent Bridge');
    action.setAttribute('aria-label', t('重新连接'));
    action.addEventListener('click', () => {
      this._setStatus(t('正在重新连接本地服务…'));
      if (typeof this._refreshRecentDocuments === 'function') {
        this._refreshRecentDocuments({ fromReconnect: true });
      }
    });
    list.appendChild(action);
  }

  _renderOfflineOrEmptyRecent(list) {
    if (this._recentDocumentsOffline && this._renderLocalWorkspaceDocument) {
      this._renderLocalWorkspaceDocument(list);
      const note = list.querySelector('.workspace-local-note');
      if (note) {
        note.textContent = t('跨文档历史需桌面版');
      }
      const trial = list.querySelector('.workspace-trial-mode');
      if (trial) trial.textContent = t('浏览器试用模式');
      this._appendRecentReconnect(list);
      return;
    }
    const empty = document.createElement('div');
    empty.className = 'recent-documents-empty';
    empty.textContent = this._recentDocumentsOffline
      ? t('本地服务未连接。当前稿仅保存在此浏览器；跨文档历史需桌面版或本地服务。')
      : t('还没有最近阅读，打开一篇文档开始。');
    if (this._recentDocumentsOffline) {
      list.appendChild(empty);
      this._appendRecentReconnect(list);
      return;
    }
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'abtn secondary';
    action.textContent = t('打开文档');
    action.addEventListener('click', () => { this.onOpen(); });
    empty.appendChild(action);
    list.appendChild(empty);
  }

  _syncWorkspacePanelWidth() {
    const split = this.splitRef?.current;
    const panel = this.aiPanelOpen ? this.aiPanelRef?.current
      : this.outlinePanelOpen ? this.outlineSidebarRef?.current
      : this.panelOpen ? this.commentsRef?.current : null;
    const width = panel?.getBoundingClientRect().width || 0;
    split?.style.setProperty('--active-side-panel-width', width + 'px');
    split?.closest('.app-shell')?.style.setProperty('--workspace-assistance-width', width + 'px');
  }

  _focusWorkspacePanels(entering) {
    const shell = this.splitRef?.current?.closest('.app-shell');
    shell?.querySelectorAll('.app-header, .document-sidebar, .app-footer, .source-pane').forEach(node => {
      node.inert = entering;
    });
    if (entering) {
      this._workspaceFocusPanels = { comments: this.panelOpen, outline: this.outlinePanelOpen, ai: this.aiPanelOpen };
      if (this.panelOpen) this._openPanel(false);
      if (this.outlinePanelOpen) this._openOutlinePanel(false);
      if (this.aiPanelOpen) this._openAIPanel(false);
    } else {
      const previous = this._workspaceFocusPanels;
      this._workspaceFocusPanels = null;
      if (previous?.ai) this._openAIPanel(true);
      else if (previous?.outline) this._openOutlinePanel(true);
      else if (previous?.comments) this._openPanel(true);
    }
  }

  _disposeWorkspaceNavigation() {
    document.removeEventListener('keydown', this._workspaceTabKey);
    window.removeEventListener('resize', this._workspaceResize);
  }
}
