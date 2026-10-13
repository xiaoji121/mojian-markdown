import type { Page } from '@playwright/test';

// Measure the rendered background, including transparent layers, not token pairs.
export async function contrast(page: Page, samples: [string, string?, string?, number?, string?][]) {
  return page.evaluate(samples => {
    const canvas = document.createElement('canvas').getContext('2d')!;
    const rgba = (color: string) => {
      canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1);
      const values = [...canvas.getImageData(0, 0, 1, 1).data]; values[3] /= 255; return values;
    };
    const over = (a: number[], b: number[]) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
    const background = (el: Element | null): number[] => {
      if (!el) return [255, 255, 255, 1];
      const color = rgba(getComputedStyle(el).backgroundColor);
      return color[3] === 1 ? color : over(color, background(el.parentElement));
    };
    const luminance = (color: number[]) => color.slice(0, 3).map(v => {
      v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return samples.flatMap(([selector, pseudo, property = 'color', minimum = 4.5, against]) => {
      const el = document.querySelector(selector);
      if (!el || !el.getClientRects().length) return [];
      const style = getComputedStyle(el, pseudo); let bg = background(against ? document.querySelector(against) : el);
      if (pseudo && property === 'color') bg = over(rgba(style.backgroundColor), bg);
      const fg = over(rgba(style.getPropertyValue(property)), bg);
      const a = luminance(fg), b = luminance(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      return [{ selector, pseudo, property, minimum, ratio, fg, bg }];
    });
  }, samples);
}

export const readingSamples: [string, string?, string?, number?][] = [
  ['.md-preview > p'], ['.md-preview a'], ['.md-preview p code'], ['.md-preview pre code'],
  ...['comment', 'keyword', 'string', 'number', 'function', 'type'].map(token => [`.md-preview .syntax-${token}`] as [string]),
  ['.md-preview blockquote'], ['.md-preview [data-comment-id]'], ['.reading-toolbar .tbtn'],
  ['.md-preview > p', '::selection'], ['.md-preview > p', '::highlight(mojian-search-current)'],
  ['.md-preview > p', '::highlight(mojian-search)'], ['.md-preview', '::-webkit-scrollbar-thumb', 'background-color', 3],
];
export const sourceSamples: [string, string?, string?, number?][] = [
  ['.pc-source-line[data-syntax=""]'], ['.pc-source-line[data-syntax=code]'], ['.pc-source-line', '::before'],
  ['.source-pane .pane-title'], ['.source-toolbar-actions .fmt-h'], ['.search-toggle', '', 'color', 3],
  ['.md-source', '::selection'], ['.source-mark.is-current'], ['.source-mark:not(.is-current)'],
  ['.md-source', '::-webkit-scrollbar-thumb', 'background-color', 3],
];
