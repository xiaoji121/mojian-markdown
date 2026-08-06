// 路径成文：阅读脉络里选出的一串节点（追问问答、摘录回答、各节点批注）
// 汇集成生成上下文，供 /api/compose 调用 AI 引擎整理成长文（article）或写成二创（remix）。
// 节点 id 约定与脉络图一致：消息用 requestId，批注回复用批注 id，空串代表主文档。

const MODE_LABELS = { article: '路径长文', remix: '路径二创' };

export function normalizeComposeMode(value) {
  return value === 'remix' ? 'remix' : 'article';
}

function trimmed(value) {
  return String(value || '').trim();
}

// 节点视图下的用户批注（answerRequestId 指向写批注时所在的子文档，空串 = 主文档）。
// 批注回复节点自身也是批注，selfId 用来把它从「该节点下的批注」里排除。
function annotationsUnder(annotations, nodeId, selfId) {
  return annotations
    .filter((item) => item.type !== 'ai' && item.id !== selfId && (item.answerRequestId || '') === nodeId)
    .map((item) => ({ quote: trimmed(item.quote), note: trimmed(item.note), reply: trimmed(item.reply) }))
    .filter((item) => item.quote || item.note || item.reply);
}

export function collectPathNodes(doc, requestIds) {
  const messages = Array.isArray(doc.messages) ? doc.messages : [];
  const annotations = Array.isArray(doc.annotations) ? doc.annotations : [];
  const messageById = new Map(messages.map((item) => [item.requestId, item]));
  const annotationById = new Map(annotations.map((item) => [item.id, item]));
  const parentOf = (id) => {
    const message = messageById.get(id);
    if (message) return message.parentRequestId || '';
    const annotation = annotationById.get(id);
    return (annotation && annotation.answerRequestId) || '';
  };
  const depthOf = (id) => {
    const seen = new Set([id]);
    let depth = 0;
    let current = parentOf(id);
    while (current && !seen.has(current)) {
      depth += 1;
      seen.add(current);
      current = parentOf(current);
    }
    return depth;
  };

  const wanted = [...new Set((Array.isArray(requestIds) ? requestIds : []).map((id) => String(id ?? '')))];
  const nodes = [];
  wanted.forEach((id) => {
    if (!id) {
      nodes.push({
        requestId: '', kind: 'document',
        question: doc.fileName || doc.title || '未命名文档',
        quote: '', answer: '', depth: -1, order: -1,
        annotations: annotationsUnder(annotations, '', null)
      });
      return;
    }
    const message = messageById.get(id);
    if (message && trimmed(message.answer)) {
      nodes.push({
        requestId: id, kind: 'qa',
        question: trimmed(message.question) || '未命名问题',
        quote: trimmed(message.quote), answer: trimmed(message.answer), engine: message.engine,
        depth: depthOf(id), order: Date.parse(message.answerAt || message.questionAt || '') || 0,
        annotations: annotationsUnder(annotations, id, null)
      });
      return;
    }
    const annotation = annotationById.get(id);
    if (annotation && annotation.type !== 'ai' && trimmed(annotation.reply)) {
      nodes.push({
        requestId: id, kind: 'reply',
        question: trimmed(annotation.note) || trimmed(annotation.question) || trimmed(annotation.quote) || '未命名想法',
        quote: trimmed(annotation.quote), answer: trimmed(annotation.reply),
        depth: depthOf(id), order: Number(annotation.replyAt || annotation.ts) || 0,
        annotations: annotationsUnder(annotations, id, id)
      });
    }
  });
  return nodes.sort((a, b) => (a.depth - b.depth) || (a.order - b.order));
}

function nodeSection(node, index) {
  const lines = [];
  if (node.kind === 'document') {
    lines.push(`## 节点 ${index + 1}：原文档《${node.question}》`);
  } else {
    lines.push(`## 节点 ${index + 1}：${node.question}`);
    if (node.quote) lines.push('', '出发的摘录：', node.quote);
    lines.push('', node.kind === 'reply' ? '摘录回答：' : 'AI 回答：', node.answer);
  }
  if (node.annotations.length) {
    lines.push('', '用户在该节点写下的批注：');
    node.annotations.forEach((item) => {
      const parts = [];
      if (item.quote) parts.push(`划线「${item.quote}」`);
      if (item.note) parts.push(`想法：${item.note}`);
      if (item.reply) parts.push(`补充回答：${item.reply}`);
      lines.push('- ' + parts.join('；'));
    });
  }
  return lines.join('\n');
}

const MODE_TASKS = {
  article: '请把这条阅读路径整理成一篇结构完整、行文连贯的长文：以用户的追问与批注为主线，'
    + '融合原文观点与各节点回答中的洞见，保留必要的原文引用；不要按节点罗列，而要重新组织成有起承转合的文章。',
  remix: '请以这条阅读路径中的思考与洞见为素材，写一篇全新的原创文章（二创）：'
    + '围绕用户在路径中真正关心的问题立意，可以引用原文观点，但不要复述原文结构，写出有独立视角的成文。'
};

export function composePrompt({ doc, nodes, mode, instruction }) {
  const parts = [
    '你是写作助手。用户在阅读一篇文章时，沿着一条思考路径逐层追问、批注，形成了下面的阅读路径。',
    '',
    '# 原文',
    `文件名：${doc.fileName || doc.title || '未命名文档'}`,
    '',
    doc.content || '',
    '',
    '# 阅读路径（按追问层级从浅到深排列）',
    '',
    nodes.map((node, index) => nodeSection(node, index)).join('\n\n'),
    '',
    '# 写作任务',
    MODE_TASKS[normalizeComposeMode(mode)]
  ];
  if (trimmed(instruction)) parts.push('', '补充要求：' + trimmed(instruction));
  parts.push('', '直接输出 Markdown 正文，第一行是以 # 开头的标题，不要输出任何解释或前后缀。');
  return parts.join('\n');
}

// 文件名带模式标签与时间戳：每次生成都是一篇新文档，不与既有同名文档合并。
export function composedFileName(doc, mode, now = new Date()) {
  const base = String(doc.fileName || doc.title || '未命名').replace(/\.(md|markdown|txt)$/i, '');
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${base} · ${MODE_LABELS[normalizeComposeMode(mode)]} ${stamp}.md`;
}

// 生成结果落盘前补一行来源说明；紧跟标题之后，无标题时放在最前。
export function composedDocumentContent(answer, { doc, nodes, mode }) {
  const provenance = `> 由「阅读脉络 · ${MODE_LABELS[normalizeComposeMode(mode)]}」生成`
    + ` · 来源：${doc.fileName || doc.title || '未命名文档'} · ${nodes.length} 个节点`;
  const text = trimmed(answer);
  const lines = text.split('\n');
  if (/^#\s/.test(lines[0] || '')) {
    return [lines[0], '', provenance, '', lines.slice(1).join('\n').trim()].join('\n');
  }
  return provenance + '\n\n' + text;
}
