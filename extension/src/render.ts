// Markdown -> HTML rendering for the reader page. Clipped pages are untrusted
// input, so raw HTML in the markdown is escaped to text; the only exception is
// <br>, which our own table rules emit for line breaks inside cells. Uses a
// dedicated Marked instance to avoid mutating the shared singleton.
import { Marked, type Tokens } from 'marked';

const renderer = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      const text = token.text;
      if (/^<br\s*\/?>$/i.test(text.trim())) return '<br>';
      return escapeHtml(text);
    }
  }
});

export function renderMarkdown(markdown: string): string {
  return renderer.parse(markdown, { async: false });
}

function escapeHtml(text: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, (ch) => entities[ch]);
}
