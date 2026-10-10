// Pure annotation export / sidecar helpers. Never writes into the source .md.
import type { Annotation, AnnotationType } from './types.ts';

export const ANNOTATION_SIDECAR_VERSION = 1 as const;

export type AnnotationExportInput = Pick<Annotation, 'id' | 'quote' | 'type' | 'note' | 'ts'> & {
  occ?: number;
  start?: number;
  question?: string;
  answer?: string;
  reply?: string;
  requestId?: string;
  documentId?: string;
};

export type AnnotationSidecar = {
  version: typeof ANNOTATION_SIDECAR_VERSION;
  /** Basename of the paired Markdown source, e.g. article.md */
  sourceFile: string;
  exportedAt: string;
  annotations: AnnotationExportInput[];
};

/** Strip a trailing .md / .markdown / .txt so sidecar names stay stable. */
export function sourceBaseName(fileName: string): string {
  const name = String(fileName || '').trim() || 'document.md';
  return name.replace(/\.(md|markdown|txt)$/i, '') || 'document';
}

export function sourceMarkdownFileName(fileName: string): string {
  const base = sourceBaseName(fileName);
  const original = String(fileName || '').trim();
  if (/\.(md|markdown|txt)$/i.test(original)) return original;
  return `${base}.md`;
}

/** Human-readable export living beside the source: article.annotations.md */
export function annotationsMarkdownFileName(fileName: string): string {
  return `${sourceBaseName(fileName)}.annotations.md`;
}

/** Machine sidecar beside the source: article.annotations.json */
export function annotationSidecarFileName(fileName: string): string {
  return `${sourceBaseName(fileName)}.annotations.json`;
}

export function backupZipFileName(fileName: string): string {
  return `${sourceBaseName(fileName)}-backup.zip`;
}

export function formatAnnotationTimestamp(ts: number, locale = 'zh-CN'): string {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  try {
    return new Date(ts).toLocaleString(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  } catch {
    return new Date(ts).toISOString();
  }
}

function blockquote(quote: string): string {
  const text = String(quote || '').replace(/\r\n/g, '\n');
  if (!text.trim()) return '> ';
  return text.split('\n').map((line) => `> ${line}`).join('\n');
}

/**
 * Annotations-only Markdown: title, numbered sections, quote blocks, idea/AI
 * fields, and timestamps. Does not include or modify the source document body.
 */
export function formatAnnotationsMarkdown(
  fileName: string,
  annotations: AnnotationExportInput[],
  typeLabel: (type: AnnotationType | string) => string,
  locale = 'zh-CN'
): string {
  const list = Array.isArray(annotations) ? annotations : [];
  const title = `# 《${fileName || '未命名.md'}》批注（共 ${list.length} 条）\n`;
  if (!list.length) return title + '\n（暂无批注）\n';
  const body = list.map((c, i) => {
    const when = formatAnnotationTimestamp(c.ts, locale);
    const head = `## ${i + 1} · ${typeLabel(c.type)}${when ? ` · ${when}` : ''}`;
    const parts = [head, '', blockquote(c.quote)];
    if (c.type === 'ai') {
      const question = (c.question || c.note || '').trim();
      if (question) parts.push('', `**问题：** ${question}`);
      if (c.answer && String(c.answer).trim()) parts.push('', '**回答：**', '', String(c.answer).trim());
    } else {
      if (c.note && c.note.trim()) parts.push('', c.note.trim());
      if (c.reply && c.reply.trim()) parts.push('', '**找到的回答：**', '', c.reply.trim());
    }
    return parts.join('\n');
  }).join('\n\n');
  return `${title}\n${body}\n`;
}

/** Sidecar JSON payload; annotations stay out of the source .md. */
export function buildAnnotationSidecar(
  fileName: string,
  annotations: AnnotationExportInput[],
  exportedAt = Date.now()
): AnnotationSidecar {
  const sourceFile = sourceMarkdownFileName(fileName);
  const list = Array.isArray(annotations) ? annotations : [];
  return {
    version: ANNOTATION_SIDECAR_VERSION,
    sourceFile,
    exportedAt: new Date(exportedAt).toISOString(),
    annotations: list.map((c) => ({
      id: c.id,
      quote: c.quote,
      occ: c.occ,
      start: c.start,
      type: c.type,
      note: c.note || '',
      ts: c.ts,
      ...(c.question ? { question: c.question } : {}),
      ...(c.answer ? { answer: c.answer } : {}),
      ...(c.reply ? { reply: c.reply } : {}),
      ...(c.requestId ? { requestId: c.requestId } : {}),
      ...(c.documentId ? { documentId: c.documentId } : {})
    }))
  };
}

export type BackupFileEntry = { name: string; text: string };

/** Two-file mental model: pure source + annotation assets (md + json sidecar). */
export function buildBackupPackageFiles(
  fileName: string,
  sourceMarkdown: string,
  annotations: AnnotationExportInput[],
  typeLabel: (type: AnnotationType | string) => string,
  locale = 'zh-CN',
  exportedAt = Date.now()
): BackupFileEntry[] {
  const sourceName = sourceMarkdownFileName(fileName);
  const sidecar = buildAnnotationSidecar(fileName, annotations, exportedAt);
  return [
    { name: sourceName, text: String(sourceMarkdown ?? '') },
    { name: annotationsMarkdownFileName(fileName), text: formatAnnotationsMarkdown(fileName, annotations, typeLabel, locale) },
    { name: annotationSidecarFileName(fileName), text: JSON.stringify(sidecar, null, 2) + '\n' }
  ];
}

/** Leave / New confirmations for browser drafts vs dirty local files. */
export function shouldConfirmLeave(options: {
  hasFile: boolean;
  dirty: boolean;
  content: string;
  commentCount: number;
  pristineSample: boolean;
}): boolean {
  const content = String(options.content || '');
  const hasMaterial = !!(content.trim() || options.commentCount > 0);
  if (options.hasFile) return !!options.dirty;
  if (!hasMaterial) return false;
  if (options.pristineSample && options.commentCount === 0) return false;
  return true;
}
