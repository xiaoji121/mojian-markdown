// Browser-side snapshot parsing: DOM reconstruction, URL absolutization, and
// Readability article extraction. Depends on DOMParser, so it is exercised
// manually through the popup rather than by the node test harness.
import { Readability } from '@mozilla/readability';
import { resolveUrl } from './convert.ts';

export interface ArticleExtract {
  html: string;
  title: string;
  byline?: string;
  excerpt?: string;
}

export function parseSnapshotDocument(html: string, pageUrl: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  ensureBase(doc, pageUrl);
  absolutizeUrls(doc, pageUrl);
  return doc;
}

// Selection HTML is a fragment; <template> parsing keeps table cells and other
// context-sensitive elements that a plain <div> innerHTML parse would drop.
export function parseFragment(html: string, pageUrl: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html;
  absolutizeUrls(template.content, pageUrl);
  const holder = document.createElement('div');
  holder.appendChild(template.content);
  return holder;
}

export function absolutizeUrls(root: ParentNode, pageUrl: string): void {
  for (const anchor of root.querySelectorAll('a[href]')) {
    anchor.setAttribute('href', resolveUrl(anchor.getAttribute('href') ?? '', pageUrl));
  }
  for (const image of root.querySelectorAll('img')) {
    const src =
      image.getAttribute('src') ||
      image.getAttribute('data-src') ||
      image.getAttribute('data-original') ||
      '';
    if (src) image.setAttribute('src', resolveUrl(src, pageUrl));
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
  }
}

export function extractArticle(doc: Document): ArticleExtract | null {
  const clone = doc.cloneNode(true) as Document; // Readability mutates its input
  // keepClasses: turndown needs `language-*` classes to emit fenced code
  // blocks with language info; it ignores all other classes anyway.
  const article = new Readability(clone, { keepClasses: true }).parse();
  if (!article?.content?.trim()) return null;
  return {
    html: article.content,
    title: (article.title ?? '').trim(),
    byline: article.byline?.trim() || undefined,
    excerpt: article.excerpt?.trim() || undefined
  };
}

function ensureBase(doc: Document, pageUrl: string): void {
  if (doc.querySelector('base[href]')) return;
  const base = doc.createElement('base');
  base.setAttribute('href', pageUrl);
  (doc.head ?? doc.documentElement).prepend(base);
}
