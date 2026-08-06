import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_LIMITS,
  LONG_IMAGE_PRESETS,
  TILE_DEVICE_HEIGHT,
  collectCssVariableNames,
  cssVariableBlock,
  extractPosterCss,
  formatByteSize,
  longImageDate,
  longImageFileName,
  longImageWidth,
  pickLongImageScale,
  planLongImageTiles
} from '../../src/editor/longImageComposer.ts';

// 样式表替身：只提供 extract/collect 真正用到的形状（cssRules / selectorText / style）。
function createSheet(rules: unknown[]) {
  return { get cssRules() { return rules; } } as unknown as CSSStyleSheet;
}

function createStyleRule(selectorText: string, cssText: string, variables: string[] = []) {
  return {
    selectorText,
    style: {
      cssText,
      length: variables.length,
      item: (index: number) => variables[index] ?? ''
    }
  };
}

test('宽度档位落到已知预设，未知 id 回落到标准档', () => {
  assert.equal(longImageWidth('phone'), 720);
  assert.equal(longImageWidth('standard'), 900);
  assert.equal(longImageWidth('不存在的档位'), 900);
  assert.equal(LONG_IMAGE_PRESETS.length, 2);
});

test('倍率取画布上限内的最大档，超长文章降档而不是失败', () => {
  assert.equal(pickLongImageScale(900, 4000), 2);
  // 高度 × 2 会撞上单边上限，退到 1.5
  assert.equal(pickLongImageScale(900, 18000), 1.5);
  assert.equal(pickLongImageScale(900, 25000), 1);
});

test('连 1 倍都超出画布上限时返回 0，交给调用方给出可操作的提示', () => {
  assert.equal(pickLongImageScale(900, CANVAS_LIMITS.maxSide + 1), 0);
  assert.equal(pickLongImageScale(0, 100), 0);
});

test('切片按设备像素整切，切点落在整数像素上，拼接不出缝', () => {
  const scale = 1.5;
  const tiles = planLongImageTiles(20000, scale);

  assert.ok(tiles.length > 1);
  tiles.forEach((tile) => {
    assert.equal(Math.round(tile.top * scale), tile.top * scale);
    assert.ok(tile.height * scale <= TILE_DEVICE_HEIGHT);
  });
  // 首尾相接、总长与海报等高：既不重叠也不漏行
  assert.equal(tiles[0].top, 0);
  const last = tiles[tiles.length - 1];
  assert.equal(last.top + last.height, 20000);
  tiles.slice(1).forEach((tile, index) => {
    assert.equal(tile.top, tiles[index].top + tiles[index].height);
  });
});

test('短文章只切一片', () => {
  assert.deepEqual(planLongImageTiles(3000, 2), [{ top: 0, height: 3000 }]);
});

test('文件名去掉 .md 与文件系统不接受的字符', () => {
  assert.equal(longImageFileName('产品/方案:v2.md', '2026-08-03'), '产品 方案 v2-2026-08-03.png');
  assert.equal(longImageFileName('   ', '2026-08-03'), '长图-2026-08-03.png');
});

test('日期按 YYYY-MM-DD 补零', () => {
  assert.equal(longImageDate(new Date(2026, 7, 3)), '2026-08-03');
});

test('体积按量级切换单位', () => {
  assert.equal(formatByteSize(0), '0 KB');
  assert.equal(formatByteSize(2048), '2 KB');
  assert.equal(formatByteSize(3 * 1024 * 1024), '3.0 MB');
});

test('抽取海报样式：把预览选择器改写到海报上，无关规则不带走', () => {
  const css = extractPosterCss([
    createSheet([
      createStyleRule('.md-preview', 'color: red'),
      createStyleRule('.md-preview pre code', 'font-size: 0.8em'),
      createStyleRule('.app-header', 'height: 54px'),
      createStyleRule('.mermaid-rendered svg', 'min-width: 620px')
    ])
  ]);

  assert.match(css, /\.longimg-prose\{color: red\}/);
  assert.match(css, /\.longimg-prose pre code\{font-size: 0\.8em\}/);
  assert.match(css, /\.mermaid-rendered svg\{min-width: 620px\}/);
  assert.doesNotMatch(css, /app-header/);
  assert.doesNotMatch(css, /\.md-preview/);
});

test('抽取海报样式：@media 与 @font-face 不进长图', () => {
  const mediaRule = { media: { mediaText: '(max-width: 760px)' }, cssRules: [] };
  const fontFace = { style: { cssText: 'font-family: X' }, cssText: '@font-face{font-family:X}' };

  const css = extractPosterCss([createSheet([mediaRule, fontFace, createStyleRule('.md-preview', 'color: red')])]);

  assert.equal(css, '.longimg-prose{color: red}');
});

test('跨源样式表读 cssRules 抛错时跳过，不影响其余样式', () => {
  const blocked = { get cssRules(): unknown[] { throw new Error('SecurityError'); } } as unknown as CSSStyleSheet;

  const css = extractPosterCss([blocked, createSheet([createStyleRule('.md-preview', 'color: red')])]);

  assert.equal(css, '.longimg-prose{color: red}');
});

test('收集样式表里声明过的 CSS 变量名并去重', () => {
  const names = collectCssVariableNames([
    createSheet([
      createStyleRule(':root', '', ['--paper-bg', '--paper-text', 'color']),
      createStyleRule('[data-paper="snow"]', '', ['--paper-bg'])
    ])
  ]);

  assert.deepEqual(names, ['--paper-bg', '--paper-text']);
});

test('变量落定成字面值，取不到值的变量不写进长图', () => {
  const block = cssVariableBlock('.longimg-poster', ['--paper-bg', '--missing'], (name) =>
    name === '--paper-bg' ? '#1c1a17' : ''
  );

  assert.equal(block, '.longimg-poster{--paper-bg:#1c1a17;}');
  assert.equal(cssVariableBlock('.longimg-poster', [], () => ''), '');
});
