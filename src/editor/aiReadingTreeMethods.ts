// @ts-nocheck
// AI 历史与阅读树之间的恢复入口。隐藏动作在 bridgeMethods，
// 这里只负责已隐藏历史卡片的操作渲染和恢复请求。
import { bridgeUrl } from './bridgeClient.ts';

export class AIReadingTreeMethods {
  _appendAIReadingTreeAction(item, message) {
    if (message.role !== 'assistant' || !message.hiddenFromReadingTree
      || !message.documentId || !message.requestId) return;
    const actions = document.createElement('div');
    actions.className = 'ai-message-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-reading-tree-restore';
    button.textContent = message.restoringToReadingTree ? '正在恢复…' : '重新加入阅读树';
    button.disabled = !!message.restoringToReadingTree;
    button.addEventListener('click', () => this.restoreAIMessageToTree(message));
    actions.appendChild(button);
    item.appendChild(actions);
  }


  async restoreAIMessageToTree(message) {
    if (!message || !message.hiddenFromReadingTree || message.restoringToReadingTree) return false;
    message.restoringToReadingTree = true;
    let restored = false;
    try {
      const response = await fetch(bridgeUrl('/api/documents/' + encodeURIComponent(message.documentId)
        + '/answers/' + encodeURIComponent(message.requestId)), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiddenFromReadingTree: false })
      });
      if (!response.ok) throw new Error('恢复失败');
      message.hiddenFromReadingTree = false;
      restored = true;
      await this._refreshRecentDocuments();
      this._setStatus('已重新加入阅读树');
    } catch {
      this._setStatus('恢复失败 · Reading Workspace 不可用');
    } finally {
      message.restoringToReadingTree = false;
      this._renderAIMessages();
    }
    return restored;
  }
}
