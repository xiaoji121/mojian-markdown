import assert from 'node:assert/strict';
import test from 'node:test';
import { Marked } from 'marked';
import { configureMarkdownMath } from '../../src/editor/markdownMath.ts';

function render(markdown: string): string {
  const parser = new Marked({ gfm: true, breaks: true });
  configureMarkdownMath(parser);
  return parser.parse(markdown) as string;
}

test('renders inline and block LaTeX while preserving TeX source for accessibility', () => {
  const html = render('速度 $7\\text{ km/h}$。\n\n$$\\frac{3.5}{7} = 0.5$$');

  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<annotation encoding="application\/x-tex">7\\text\{ km\/h\}<\/annotation>/);
  assert.match(html, /<annotation encoding="application\/x-tex">\\frac\{3\.5\}\{7\} = 0\.5<\/annotation>/);
});

test('does not treat unmatched or escaped dollar signs as formulas', () => {
  const html = render('价格是 $7，优惠后 \\$5。');

  assert.doesNotMatch(html, /class="katex/);
  assert.match(html, /价格是 \$7，优惠后 \$5。/);
});
