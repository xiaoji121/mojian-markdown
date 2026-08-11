// @ts-nocheck
// 内置 Agent 的执行级审批与当前文档写回。请求级授权仍由 aiMethods 负责；
// 这里只处理模型真正提出替换时的 diff 确认、冲突保护和一键撤销。
import { bridgeUrl } from './bridgeClient.ts';

export class AIApprovalMethods {
  _formatAIApprovalPrompt(data) {
    const diff = data?.diff || {};
    const stats = `新增 ${Number(diff.addedLines) || 0} 行，删除 ${Number(diff.removedLines) || 0} 行`;
    return [
      'Agent 准备修改当前文档',
      '',
      String(data?.summary || '替换当前文档'),
      stats,
      '',
      String(diff.preview || '没有可展示的差异'),
      '',
      '确认应用这次修改？'
    ].join('\n');
  }

  async _submitAIApproval(data, approved) {
    const response = await fetch(bridgeUrl('/api/approvals/') + encodeURIComponent(data.approvalId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: approved === true, argsHash: data.argsHash })
    });
    if (!response.ok) throw new Error('审批已失效，请重新发起修改');
    return approved === true;
  }

  async _reviewAIApproval(data, state, confirmWrite = (prompt) => window.confirm(prompt)) {
    const source = this.sourceRef?.current;
    const unchanged = !!source && source.value === state.originalContent;
    let approved = false;
    if (!unchanged) {
      this._setStatus('正文已变化，已拒绝 Agent 修改；请基于最新内容重试');
    } else {
      approved = confirmWrite(this._formatAIApprovalPrompt(data)) === true;
      this._setStatus(approved ? '已批准 Agent 修改，正在写入…' : '已拒绝 Agent 修改');
    }
    this._recordAIProgress(state.assistant, {
      label: approved ? '已批准当前文档修改' : '当前文档修改未获批准',
      state: 'done'
    });
    this._renderAIMessages();
    return this._submitAIApproval(data, approved);
  }

  _applyAIDocumentUpdate(data, expectedContent) {
    const source = this.sourceRef?.current;
    if (!data || data.documentId !== this.bridgeDocumentId || !source || typeof data.content !== 'string') return false;
    if (typeof expectedContent === 'string' && source.value !== expectedContent) {
      this._setStatus('正文已变化，未覆盖你刚刚的编辑');
      return false;
    }
    this._syncCurrentEditingState();
    source.value = data.content;
    this._recordEditingHistory('agent', true);
    this._renderPreview();
    this._updateCount();
    this._touch();
    return true;
  }

  undoAIDocumentUpdate(message) {
    if (!message?.documentUndoAvailable) return false;
    this.undoEdit();
    message.documentUndoAvailable = false;
    this._renderAIMessages();
    this._setStatus('已撤销 Agent 对当前文档的修改');
    return true;
  }

  _appendAIDocumentUndoAction(item, message) {
    if (message.role !== 'assistant' || !message.documentUndoAvailable) return;
    let actions = item.querySelector && item.querySelector('.ai-message-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'ai-message-actions';
      item.appendChild(actions);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-document-undo';
    button.textContent = '撤销 Agent 修改';
    button.addEventListener('click', () => this.undoAIDocumentUpdate(message));
    actions.appendChild(button);
  }
}
