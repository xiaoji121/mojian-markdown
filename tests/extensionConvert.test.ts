import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeClipMarkdown,
  createTurndown,
  resolveUrl,
  suggestFileName,
  type ClipMeta
} from '../extension/src/convert.ts';

const meta: ClipMeta = {
  title: '一篇“测试”文章',
  url: 'https://example.com/post?id=1',
  capturedAt: new Date('2026-07-11T08:00:00.000Z')
};

test('converts common article HTML to markdown', () => {
  const html =
    '<h2>标题</h2><p>正文带<strong>重点</strong>和<a href="https://example.com/a">链接</a>。</p>' +
    '<ul><li>甲</li><li>乙</li></ul>';
  const markdown = createTurndown().turndown(html);
  assert.equal(markdown, '## 标题\n\n正文带**重点**和[链接](https://example.com/a)。\n\n- 甲\n- 乙');
});

test('keeps fenced code blocks with language info', () => {
  const html = '<pre><code class="language-ts">const a = 1;\n</code></pre>';
  assert.equal(createTurndown().turndown(html), '```ts\nconst a = 1;\n```');
});

test('falls back to text for <pre> without a direct <code> child', () => {
  const html = '<pre><div><span>line1</span>\n<span>line2</span></div></pre>';
  assert.equal(createTurndown().turndown(html), '```\nline1\nline2\n```');
});

test('converts strikethrough tags', () => {
  assert.equal(createTurndown().turndown('<p>旧<del>删除</del>新</p>'), '旧~~删除~~新');
});

test('keeps images with alt text', () => {
  const html = '<p><img src="https://example.com/a.png" alt="示意图"></p>';
  assert.equal(createTurndown().turndown(html), '![示意图](https://example.com/a.png)');
});

test('composes markdown with yaml front matter and title heading', () => {
  const markdown = composeClipMarkdown(meta, '正文内容', true);
  assert.equal(
    markdown,
    [
      '---',
      'title: "一篇“测试”文章"',
      'source: "https://example.com/post?id=1"',
      'captured: 2026-07-11T08:00:00.000Z',
      '---',
      '',
      '# 一篇“测试”文章',
      '',
      '正文内容',
      ''
    ].join('\n')
  );
});

test('escapes double quotes and newlines in front matter values', () => {
  const tricky = { ...meta, title: '含 "引号"\n和换行' };
  const markdown = composeClipMarkdown(tricky, '内容', true);
  assert.match(markdown, /title: "含 \\"引号\\" 和换行"/);
});

test('includes author and excerpt when present', () => {
  const full = { ...meta, byline: '作者甲', excerpt: '摘要一句话' };
  const markdown = composeClipMarkdown(full, '内容', true);
  assert.match(markdown, /author: "作者甲"/);
  assert.match(markdown, /excerpt: "摘要一句话"/);
});

test('returns bare body without meta', () => {
  assert.equal(composeClipMarkdown(meta, '  正文  ', false), '正文\n');
  assert.equal(composeClipMarkdown(meta, '   ', false), '');
});

test('sanitizes suggested file names', () => {
  assert.equal(suggestFileName('A/B:C*D?"E"<F>|G'), 'A B C D E F G.md');
  assert.equal(suggestFileName('   '), '未命名网页.md');
  assert.equal(suggestFileName('长'.repeat(120)), `${'长'.repeat(80)}.md`);
});

test('resolves relative urls against the page url', () => {
  assert.equal(resolveUrl('/img/a.png', 'https://example.com/post/1'), 'https://example.com/img/a.png');
  assert.equal(resolveUrl('../b.png', 'https://example.com/a/b/c'), 'https://example.com/a/b.png');
  assert.equal(resolveUrl('//cdn.example.com/c.js', 'https://example.com/'), 'https://cdn.example.com/c.js');
  assert.equal(resolveUrl('https://other.com/x', 'https://example.com/'), 'https://other.com/x');
  assert.equal(resolveUrl('', 'https://example.com/'), '');
  assert.equal(resolveUrl('a', 'not a base'), 'a');
});
