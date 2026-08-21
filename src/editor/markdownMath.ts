import katex from 'katex';

interface MathToken {
  type: string;
  raw: string;
  text: string;
}

interface MarkedLike {
  use(options: { extensions: MathExtension[] }): unknown;
}

interface MathExtension {
  name: string;
  level: 'block' | 'inline';
  start(source: string): number | undefined;
  tokenizer(source: string): MathToken | undefined;
  renderer(token: MathToken): string;
}

function renderFormula(source: string, displayMode: boolean): string {
  return katex.renderToString(source.trim(), {
    displayMode,
    throwOnError: false,
    strict: false,
    output: 'htmlAndMathml'
  });
}

const blockMath: MathExtension = {
  name: 'blockMath',
  level: 'block',
  start(source) {
    const index = source.indexOf('$$');
    return index < 0 ? undefined : index;
  },
  tokenizer(source) {
    const match = /^\$\$[ \t]*(?:\n)?([\s\S]+?)(?:\n)?[ \t]*\$\$(?:\n|$)/.exec(source);
    if (!match) return undefined;
    return { type: 'blockMath', raw: match[0], text: match[1] };
  },
  renderer(token) {
    return renderFormula(token.text, true) + '\n';
  }
};

const inlineMath: MathExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(source) {
    const index = source.indexOf('$');
    return index < 0 ? undefined : index;
  },
  tokenizer(source) {
    const match = /^\$(?!\$)((?:\\.|[^\\$\n])+?)\$(?!\$)/.exec(source);
    if (!match) return undefined;
    return { type: 'inlineMath', raw: match[0], text: match[1] };
  },
  renderer(token) {
    return renderFormula(token.text, false);
  }
};

/** Adds `$…$` and `$$…$$` support to the editor's existing Marked parser. */
export function configureMarkdownMath(marked: MarkedLike): void {
  marked.use({ extensions: [blockMath, inlineMath] });
}
