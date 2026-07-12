// Markdown conversion and clip-metadata helpers for the browser extension.
// Everything here is pure string/URL logic so it runs under `node --test`;
// DOM-dependent extraction lives in extract.ts.
import TurndownService from 'turndown';
import { addTableRules } from '../../src/editor/markdownTableRules.ts';

export interface ClipMeta {
  title: string;
  url: string;
  capturedAt: Date;
  byline?: string;
  excerpt?: string;
}

export function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**'
  });
  addTableRules(td);
  // Turndown pads list markers to four columns ("-   item"); clipped notes
  // read better with the common single-space form. Continuation lines keep the
  // default four-space indent so nested lists stay inside their parent item.
  td.addRule('tightListItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const body = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, '\n    ');
      let prefix = `${options.bulletListMarker} `;
      const parent = node.parentNode as HTMLElement | null;
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? '1');
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = `${(Number.isFinite(start) ? start : 1) + index}. `;
      }
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '');
    }
  });
  td.addRule('strikethrough', {
    filter: (node) => node.nodeName === 'DEL' || node.nodeName === 'S' || node.nodeName === 'STRIKE',
    replacement: (content) => (content.trim() ? `~~${content}~~` : '')
  });
  // Turndown's built-in fenced rule only matches <pre> whose first child is
  // <code>; highlighted code on real pages often nests differently.
  td.addRule('barePreBlock', {
    filter: (node) => node.nodeName === 'PRE' && node.firstChild?.nodeName !== 'CODE',
    replacement: (_content, node) => {
      const text = (node.textContent ?? '').replace(/\n$/, '');
      if (!text.trim()) return '';
      const fence = text.includes('```') ? '````' : '```';
      return `\n\n${fence}\n${text}\n${fence}\n\n`;
    }
  });
  return td;
}

export function composeClipMarkdown(meta: ClipMeta, body: string, withMeta: boolean): string {
  const content = body.trim();
  if (!withMeta) return content ? `${content}\n` : '';
  const parts = [buildFrontMatter(meta), '', `# ${meta.title}`];
  if (content) parts.push('', content);
  return parts.join('\n') + '\n';
}

export function buildFrontMatter(meta: ClipMeta): string {
  const lines = [
    '---',
    `title: ${yamlText(meta.title)}`,
    `source: ${yamlText(meta.url)}`,
    `captured: ${meta.capturedAt.toISOString()}`
  ];
  if (meta.byline) lines.push(`author: ${yamlText(meta.byline)}`);
  if (meta.excerpt) lines.push(`excerpt: ${yamlText(meta.excerpt)}`);
  lines.push('---');
  return lines.join('\n');
}

export function suggestFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return `${cleaned || '未命名网页'}.md`;
}

export function resolveUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return value;
  }
}

function yamlText(value: string): string {
  const collapsed = value.replace(/\s*\n\s*/g, ' ').trim();
  return `"${collapsed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
