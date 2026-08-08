// @ts-nocheck
// 阅读脉络图：把一篇文档的追问树（AI 问答 + 摘录回答的逐级追问）
// 渲染成 mermaid 流程图，从侧栏文档条目进入，复用预览 override 视图。
// 脉络视图不属于任何子文档（activeAnswerRequestId 为空），
// 批注高亮与划词工具条在该视图下由 commentMethods 统一挡掉。
import { bridgeUrl } from './bridgeClient.ts';

export class ReadingMapMethods {
  async openReadingMap(documentId) {
    try {
      // 先把防抖中的批注/回复落盘，脉络里才能看到刚写下的追问。
      await this._flushBridgeSync();
      const response = await fetch(bridgeUrl('/api/documents/') + encodeURIComponent(documentId));
      if (!response.ok) throw new Error('阅读脉络读取失败');
      const doc = (await response.json()).document;
      this.bridgeDocumentId = doc.documentId;
      this.activeDocumentId = doc.documentId;
      this.activeAnswerRequestId = null;
      const nodes = this._readingMapNodes(doc);
      this._readingMapIndex = this._readingMapBuildIndex(nodes);
      this._readingMapTitles = this._readingMapBuildTitles(doc, nodes);
      this._readingMapParents = this._readingMapParentIndex(nodes);
      if (typeof this._resetReadingPathForDocument === 'function') {
        this._resetReadingPathForDocument(doc.documentId);
      }
      this._bindReadingMapClicks();
      this.previewOverrideMarkdown = this._readingMapMarkdown(doc, nodes);
      this.viewMode = 'preview';
      this._syncViewMode();
      this._renderPreview();
      this._renderRecentDocuments();
      this._setStatus('正在查看阅读脉络 · ' + (doc.fileName || '未命名文档'));
      this.closeDocumentSidebar();
    } catch (error) {
      this._setStatus(error.message || '阅读脉络读取失败');
    }
  }


  // 与 bridge 端 summarizeDocument 同构：有回答的消息 + 有回复的批注才是子文档节点。
  _readingMapNodes(doc) {
    const messages = Array.isArray(doc.messages) ? doc.messages : [];
    const annotations = Array.isArray(doc.annotations) ? doc.annotations : [];
    const nodes = [];
    messages.filter((item) => item.answer).forEach((item) => nodes.push({
      requestId: item.requestId,
      question: item.question || '未命名问题',
      kind: item.engine === 'codex' ? 'Codex' : 'AI',
      parentRequestId: item.parentRequestId,
      hiddenFromReadingTree: item.hiddenFromReadingTree === true
    }));
    annotations
      .filter((item) => item.type !== 'ai' && item.reply && String(item.reply).trim())
      .forEach((item) => nodes.push({
        requestId: item.id,
        question: item.note || item.question || item.quote || '未命名想法',
        kind: '摘录',
        parentRequestId: item.answerRequestId,
        hiddenFromReadingTree: item.hiddenFromReadingTree === true
      }));
    const hidden = new Set(nodes.filter((node) => node.hiddenFromReadingTree).map((node) => node.requestId));
    let changed = true;
    while (changed) {
      changed = false;
      nodes.forEach((node) => {
        if (node.parentRequestId && hidden.has(node.parentRequestId) && !hidden.has(node.requestId)) {
          hidden.add(node.requestId);
          changed = true;
        }
      });
    }
    return nodes.filter((node) => !hidden.has(node.requestId));
  }


  // mermaid 节点标签：剔除会破坏语法的字符，最多展示两行。
  // 完整内容仍可通过点击节点打开，图中只保留足够辨认的摘要。
  _mermaidLabel(text) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').replace(/["'`[\]{}()<>|#;]/g, '').trim();
    const characters = Array.from(cleaned || '未命名问题');
    const visible = characters.length > 36 ? [...characters.slice(0, 35), '…'] : characters;
    const lines = [];
    for (let index = 0; index < visible.length; index += 18) {
      lines.push(visible.slice(index, index + 18).join(''));
    }
    return lines.join('<br/>');
  }


  // mermaid 节点 id（doc0/q0/q1…）→ 子文档 requestId；根节点映射为空串代表主文档。
  _readingMapBuildIndex(nodes) {
    const index = { doc0: '' };
    nodes.forEach((node, i) => { index['q' + i] = node.requestId; });
    return index;
  }


  // 节点 id → 未截断标题，供 SVG 节点使用原生 title 悬停展示。
  _readingMapBuildTitles(doc, nodes) {
    const titles = { doc0: String(doc.fileName || doc.title || '未命名文档') };
    nodes.forEach((node, i) => { titles['q' + i] = String(node.question || '未命名问题'); });
    return titles;
  }


  _applyReadingMapTitles(host) {
    if (!host || !host.querySelectorAll || !this._readingMapTitles) return;
    host.querySelectorAll('.node').forEach((node) => {
      const match = /(?:^|-)(doc0|q\d+)(?:-|$)/.exec(node.id || '');
      const title = match && this._readingMapTitles[match[1]];
      if (title && node.setAttribute) node.setAttribute('title', title);
    });
  }


  // 父指针索引（子节点 → 有效父节点，缺失/成环回落为主文档 ''），路径选择沿它上溯。
  _readingMapParentIndex(nodes) {
    const known = new Set(nodes.map((node) => node.requestId));
    const parents = new Map();
    nodes.forEach((node) => {
      const valid = node.parentRequestId && node.parentRequestId !== node.requestId && known.has(node.parentRequestId);
      parents.set(node.requestId, valid ? node.parentRequestId : '');
    });
    return parents;
  }


  // 点击委托挂在预览容器上（innerHTML 重渲染不影响），只绑一次。
  _bindReadingMapClicks() {
    if (this._readingMapClickBound) return;
    const prev = this.previewRef && this.previewRef.current;
    if (!prev || !prev.addEventListener) return;
    prev.addEventListener('click', (e) => this._onReadingMapClick(e));
    this._readingMapClickBound = true;
  }


  _onReadingMapClick(event) {
    // 仅在脉络视图（override 且不属于任何子文档）里劫持节点点击
    if (!this._readingMapIndex || !this.previewOverrideMarkdown || this.activeAnswerRequestId) return;
    const node = event.target && event.target.closest && event.target.closest('.mermaid-rendered .node');
    if (!node || !node.id) return;
    // mermaid 渲染的节点 DOM id 形如 flowchart-q1-42，抽出我们自己的节点名
    const match = /(?:^|-)(doc0|q\d+)(?:-|$)/.exec(node.id);
    if (!match) return;
    const requestId = this._readingMapIndex[match[1]];
    if (requestId === undefined || !this.bridgeDocumentId) return;
    // 路径选择模式：点击改为选中/取消节点，交给 pathComposeMethods 结算。
    if (this.readingPathSelectMode && typeof this._toggleReadingPathNode === 'function') {
      this._toggleReadingPathNode(requestId);
      return;
    }
    if (requestId) this.openAnswerDocument(this.bridgeDocumentId, requestId);
    else this.openRecentDocument(this.bridgeDocumentId);
  }


  _readingMapMarkdown(doc, precomputedNodes) {
    const nodes = precomputedNodes || this._readingMapNodes(doc);
    const known = new Set(nodes.map((node) => node.requestId));
    const idOf = new Map(nodes.map((node, index) => [node.requestId, 'q' + index]));
    const lines = [
      'flowchart TD',
      '  doc0["📄 ' + this._mermaidLabel(doc.fileName || doc.title) + '"]'
    ];
    nodes.forEach((node) => {
      const id = idOf.get(node.requestId);
      lines.push('  ' + id + '(["' + this._mermaidLabel(node.question) + ' · ' + node.kind + '"])');
      const valid = node.parentRequestId && node.parentRequestId !== node.requestId && known.has(node.parentRequestId);
      lines.push('  ' + (valid ? idOf.get(node.parentRequestId) : 'doc0') + ' --> ' + id);
    });
    return [
      '# 阅读脉络',
      '> ' + (doc.fileName || '未命名文档') + ' · ' + nodes.length + ' 个追问节点 · 点击图中节点可打开对应子文档',
      '```mermaid',
      lines.join('\n'),
      '```'
    ].join('\n\n');
  }
}
