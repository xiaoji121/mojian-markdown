// 「保存长图」的纯逻辑：尺寸档位、倍率选择、切片规划、样式抽取。
// 这里不碰真实 DOM 渲染，只做可预测的计算与字符串处理，便于单测直接调用
// （见 tests/unit/longImageComposer.test.ts）；渲染与交互在 longImageMethods.ts。

export interface LongImagePreset {
  id: string;
  label: string;
  /** 长图总宽度（CSS px），左右内边距由样式表统一给 */
  width: number;
  hint: string;
}

// 两档就够：竖屏分享用窄的，长文阅读用与沉浸式阅读一致的版心。
// 再多一档就变成「让用户逐像素纠结」，与设计规范第 5 条相悖。
export const LONG_IMAGE_PRESETS: LongImagePreset[] = [
  { id: 'phone', label: '手机', width: 720, hint: '窄版心，适合手机竖屏分享' },
  { id: 'standard', label: '标准', width: 900, hint: '与沉浸式阅读版心一致' }
];

export const DEFAULT_LONG_IMAGE_PRESET = 'standard';

export function longImagePreset(id: string): LongImagePreset {
  return LONG_IMAGE_PRESETS.find((preset) => preset.id === id)
    || LONG_IMAGE_PRESETS.find((preset) => preset.id === DEFAULT_LONG_IMAGE_PRESET)!;
}

export function longImageWidth(id: string): number {
  return longImagePreset(id).width;
}

// 浏览器画布既限单边也限总面积，取值保守一档：Chrome 单边上限更高，
// 但接近上限时 toBlob 容易直接返回 null，留出余量比压榨极限值得。
export const CANVAS_LIMITS = { maxSide: 32000, maxArea: 268435456 };

// 只用能被切片高度整除的倍率，切点才会落在整数设备像素上，拼接不出缝。
export const LONG_IMAGE_SCALES = [2, 1.5, 1];

/** 选一个不超出画布上限的最大倍率；返回 0 表示这张图无论如何都画不出来。 */
export function pickLongImageScale(
  width: number,
  height: number,
  limits = CANVAS_LIMITS
): number {
  if (!(width > 0) || !(height > 0)) return 0;
  return LONG_IMAGE_SCALES.find((scale) => {
    const w = width * scale;
    const h = height * scale;
    return w <= limits.maxSide && h <= limits.maxSide && w * h <= limits.maxArea;
  }) || 0;
}

/** 单张切片的设备像素高度上限：太高的 SVG 光栅化会失败，太低则重复排版次数变多。 */
export const TILE_DEVICE_HEIGHT = 12000;

export interface LongImageTile {
  /** 该片在整张海报中的起始位置（CSS px） */
  top: number;
  /** 该片高度（CSS px） */
  height: number;
}

export function planLongImageTiles(
  height: number,
  scale: number,
  tileDeviceHeight = TILE_DEVICE_HEIGHT
): LongImageTile[] {
  const total = Math.max(height, 1);
  const step = tileDeviceHeight / (scale || 1);
  const tiles: LongImageTile[] = [];
  for (let top = 0; top < total; top += step) {
    tiles.push({ top, height: Math.min(step, total - top) });
  }
  return tiles.length ? tiles : [{ top: 0, height: total }];
}

export function longImageDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

/** 由标题与日期生成下载文件名；剔除文件系统不接受的字符。 */
export function longImageFileName(title: string, date: string): string {
  const base = String(title || '')
    .replace(/\.md$/i, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '长图';
  return base + '-' + date + '.png';
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// 海报要用到的样式：正文排版（.md-preview / .mermaid-rendered）与海报自身
// （.longimg-poster / .longimg-prose）。弹窗外壳（.longimg-modal…）不进长图。
const POSTER_SELECTOR = /\.md-preview|\.mermaid-rendered|\.longimg-poster|\.longimg-prose/;

type StyleRuleVisitor = (rule: { selectorText: string; style: CSSStyleDeclaration }) => void;

// 只收普通样式规则：@media 一律跳过（静态长图不需要响应式断点，
// 带上反而会按 SVG 视口宽度错误命中移动端布局），@keyframes / @font-face 同理。
function forEachStyleRule(sheets: ArrayLike<CSSStyleSheet> | null | undefined, visit: StyleRuleVisitor): void {
  for (const sheet of Array.from(sheets || [])) {
    let rules: ArrayLike<CSSRule> | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // 跨源样式表读 cssRules 会抛，跳过即可
    }
    for (const rule of Array.from(rules || [])) {
      const candidate = rule as unknown as { selectorText?: string; style?: CSSStyleDeclaration };
      if (candidate.selectorText && candidate.style) {
        visit({ selectorText: candidate.selectorText, style: candidate.style });
      }
    }
  }
}

/** 抄一份预览排版规则，选择器改写到海报上，页面预览与 SVG 栅格共用同一份。 */
export function extractPosterCss(sheets: ArrayLike<CSSStyleSheet> | null | undefined): string {
  const chunks: string[] = [];
  forEachStyleRule(sheets, (rule) => {
    if (!POSTER_SELECTOR.test(rule.selectorText)) return;
    const selector = rule.selectorText.replace(/\.md-preview\b/g, '.longimg-prose');
    const body = rule.style.cssText;
    if (body) chunks.push(selector + '{' + body + '}');
  });
  return chunks.join('\n');
}

/** 收集样式表里声明过的全部 CSS 变量名，用于把当前主题/纸色落定成字面值。 */
export function collectCssVariableNames(sheets: ArrayLike<CSSStyleSheet> | null | undefined): string[] {
  const names = new Set<string>();
  forEachStyleRule(sheets, (rule) => {
    const style = rule.style;
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index);
      if (name && name.startsWith('--')) names.add(name);
    }
  });
  return [...names];
}

export function cssVariableBlock(
  selector: string,
  names: string[],
  read: (name: string) => string
): string {
  const declarations = names
    .map((name) => {
      const value = read(name);
      return value ? name + ':' + value + ';' : '';
    })
    .join('');
  return declarations ? selector + '{' + declarations + '}' : '';
}
