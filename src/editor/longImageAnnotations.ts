// 长图专用的批注回填：预览中只有划线和编号，生成图片时把批注正文
// 放回对应段落下方。这里只操作海报克隆 DOM，不会污染编辑器预览。

interface LongImageAnnotation {
  id: string;
  quote?: string;
  type?: string;
  note?: string;
  question?: string;
  answer?: string;
  reply?: string;
}

interface AnnotationCopy {
  note: string;
  reply: string;
  replyLabel: string;
}

function annotationCopy(comment: LongImageAnnotation): AnnotationCopy {
  if (comment.type === 'ai') {
    return {
      note: String(comment.question || comment.note || '').trim(),
      reply: String(comment.answer || '').trim(),
      replyLabel: '回应'
    };
  }
  return {
    note: String(comment.note || '').trim(),
    reply: String(comment.reply || '').trim(),
    replyLabel: '补充'
  };
}

function wrapTextRange(root: HTMLElement, start: number, end: number, comment: LongImageAnnotation): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let node: Text | null;
  let position = 0;
  while ((node = walker.nextNode() as Text | null)) {
    const length = node.nodeValue?.length || 0;
    nodes.push({ node, start: position, end: position + length });
    position += length;
  }
  let first: HTMLElement | null = null;
  nodes.forEach((item) => {
    if (item.end <= start || item.start >= end) return;
    let text = item.node;
    const from = Math.max(start, item.start) - item.start;
    const to = Math.min(end, item.end) - item.start;
    if (from > 0) text = text.splitText(from);
    if (to - from < text.length) text.splitText(to - from);
    const mark = document.createElement('span');
    mark.className = 'longimg-restored-mark is-' + (comment.type || 'marker');
    mark.setAttribute('data-comment-id', comment.id);
    mark.title = '查看批注';
    text.parentNode?.insertBefore(mark, text);
    mark.appendChild(text);
    if (!first) first = mark;
  });
  return first;
}

function restoreSelectionMarks(
  content: HTMLElement,
  commentsById: Map<string, { comment: LongImageAnnotation; index: number }>,
  selectedIds: string[]
): void {
  const full = content.textContent || '';
  selectedIds.forEach((id) => {
    if (!id || content.querySelector('[data-comment-id="' + CSS.escape(id) + '"]')) return;
    const entry = commentsById.get(id);
    if (!entry) return;
    const quote = String(entry.comment.quote || '');
    const start = quote ? full.indexOf(quote) : -1;
    if (start < 0) return;
    const mark = wrapTextRange(content, start, start + quote.length, entry.comment);
    if (!mark) return;
    const badge = document.createElement('sup');
    badge.className = 'longimg-restored-badge';
    badge.setAttribute('data-comment-badge', id);
    badge.textContent = String(entry.index + 1);
    mark.insertAdjacentElement('afterend', badge);
  });
}

function cardFor(comment: LongImageAnnotation, index: number, copy: AnnotationCopy): HTMLElement {
  const card = document.createElement('aside');
  card.className = 'longimg-comment-card';

  const label = document.createElement('div');
  label.className = 'longimg-comment-label';
  label.textContent = '我的批注 · ' + String(index + 1).padStart(2, '0');
  card.appendChild(label);

  if (copy.note) {
    const note = document.createElement('div');
    note.className = 'longimg-comment-note';
    note.textContent = copy.note;
    card.appendChild(note);
  }
  if (copy.reply) {
    const reply = document.createElement('div');
    reply.className = 'longimg-comment-reply';
    const replyLabel = document.createElement('span');
    replyLabel.textContent = copy.replyLabel;
    const replyText = document.createElement('span');
    replyText.textContent = copy.reply;
    reply.append(replyLabel, replyText);
    card.appendChild(reply);
  }
  return card;
}

function stackFor(mark: Element | undefined, content: HTMLElement, id: string): HTMLElement {
  let insertionPoint = mark;
  const next = insertionPoint?.nextElementSibling;
  if (next?.getAttribute('data-comment-badge') === id) insertionPoint = next;
  const existing = insertionPoint?.nextElementSibling?.matches('.longimg-comment-stack')
    ? insertionPoint.nextElementSibling
    : !insertionPoint ? content.querySelector(':scope > .longimg-comment-stack:last-child') : null;
  if (existing instanceof HTMLElement) return existing;

  const stack = document.createElement('div');
  stack.className = 'longimg-comment-stack';
  if (insertionPoint) insertionPoint.insertAdjacentElement('afterend', stack);
  else content.appendChild(stack);
  return stack;
}

/** 把当前长图内可见的、有文字内容的批注按原文顺序挂回段落。 */
export function appendLongImageAnnotations(
  content: HTMLElement,
  comments: LongImageAnnotation[] = [],
  selectedIds: string[] = []
): void {
  const commentsById = new Map(comments.map((comment, index) => [comment.id, { comment, index }]));
  restoreSelectionMarks(content, commentsById, selectedIds);
  const marks = Array.from(content.querySelectorAll('[data-comment-id]'));
  const marksById = new Map<string, Element>();
  marks.forEach((mark) => marksById.set(mark.getAttribute('data-comment-id') || '', mark));
  const ids = [...marksById.keys(), ...selectedIds.filter((id) => !marksById.has(id))];
  const seen = new Set<string>();

  ids.forEach((id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const entry = commentsById.get(id);
    if (!entry) return;
    const copy = annotationCopy(entry.comment);
    if (!copy.note && !copy.reply) return;
    const mark = marksById.get(id);
    stackFor(mark, content, id)
      .appendChild(cardFor(entry.comment, entry.index, copy));
  });
}
