import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../extension/src/render.ts';

test('renders headings, lists, and gfm tables', () => {
  const html = renderMarkdown('## 标题\n\n- 甲\n- 乙\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.match(html, /<h2>标题<\/h2>/);
  assert.match(html, /<li>甲<\/li>/);
  assert.match(html, /<table>[\s\S]*<td>1<\/td>/);
});

test('renders fenced code with language class', () => {
  const html = renderMarkdown('```ts\nconst a = 1;\n```');
  assert.match(html, /<pre><code class="language-ts">const a = 1;/);
});

test('escapes raw html blocks from untrusted pages', () => {
  const html = renderMarkdown('前文\n\n<script>alert(1)</script>\n\n后文');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('escapes inline html but keeps <br> line breaks', () => {
  const html = renderMarkdown('| K |\n| --- |\n| 行一<br>行二 |');
  assert.match(html, /行一<br>行二/);
  const inline = renderMarkdown('文字<img src=x onerror=alert(1)>结尾');
  assert.doesNotMatch(inline, /<img/);
  assert.match(inline, /&lt;img/);
});
