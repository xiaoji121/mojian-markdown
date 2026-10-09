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
      const ai = event.key === 'End' || (event.key !== 'Home' && this.panelOpen);
      if (ai && this.agentBridgeEnabled) this._openAIPanel(true);
      else this._openPanel(true);
      const panel = this.aiPanelOpen ? this.aiPanelRef.current : this.commentsRef.current;
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
      showAITab: () => this._openAIPanel(true)
    };
  }

  _syncWorkspaceChrome() {
    const shell = this.splitRef?.current?.closest?.('.app-shell');
    shell?.classList.toggle('has-assistance', !!(this.panelOpen || this.aiPanelOpen));
    shell?.querySelectorAll('.assistance-count').forEach(node => { node.textContent = String(this.comments.length); });
    const status = shell?.querySelector('.workspace-save-label');
    if (status) {
      status.textContent = t(this._localFileConflict ? '文件冲突' : this.dirty ? '未保存到文件' : (this.fileHandle || this.localFilePath) ? '已保存' : '草稿');
      status.title = this.saveStatusRef.current?.textContent || '';
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
    const note = document.createElement('p');
    note.className = 'workspace-local-note';
    note.textContent = t('当前文档保存在此浏览器。跨文档历史可在桌面版或本地服务中使用。');
    list.appendChild(note);
  }

  _syncWorkspacePanelWidth() {
    const split = this.splitRef?.current;
    const panel = this.aiPanelOpen ? this.aiPanelRef?.current : this.panelOpen ? this.commentsRef?.current : null;
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
      this._workspaceFocusPanels = { comments: this.panelOpen, ai: this.aiPanelOpen };
      if (this.panelOpen) this._openPanel(false);
      if (this.aiPanelOpen) this._openAIPanel(false);
    } else {
      const previous = this._workspaceFocusPanels;
      this._workspaceFocusPanels = null;
      if (previous?.ai) this._openAIPanel(true);
      else if (previous?.comments) this._openPanel(true);
    }
  }

  _disposeWorkspaceNavigation() {
    document.removeEventListener('keydown', this._workspaceTabKey);
    window.removeEventListener('resize', this._workspaceResize);
  }
}
