import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { addTableRules } from '../../src/editor/markdownTableRules.ts';

function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**'
  });
  addTableRules(td);
  return td;
}

marked.setOptions({ gfm: true, breaks: true });

test('round-trips a marked-rendered table back to the same GFM source', () => {
  const markdown = [
    '| 名称 | 数量 | 备注 |',
    '| --- | :---: | ---: |',
    '| 苹果 | 3 | 新鲜 |',
    '| 香蕉 | 5 | 打折 |'
  ].join('\n');
  const html = marked.parse(markdown) as string;
  assert.equal(createTurndown().turndown(html), markdown);
});

test('keeps surrounding content separated from the table', () => {
  const markdown = ['前文段落', '', '| A | B |', '| --- | --- |', '| 1 | 2 |', '', '后文段落'].join('\n');
  const html = marked.parse(markdown) as string;
  assert.equal(createTurndown().turndown(html), markdown);
});

test('escapes pipes typed into a cell', () => {
  const html = '<table><thead><tr><th>K</th></tr></thead><tbody><tr><td>a | b</td></tr></tbody></table>';
  const result = createTurndown().turndown(html);
  assert.equal(result, '| K |\n| --- |\n| a \\| b |');
  const reparsed = marked.parse(result) as string;
  assert.match(reparsed, /<td>a \| b<\/td>/);
});

test('encodes line breaks inside a cell as <br>', () => {
  const html = '<table><thead><tr><th>K</th></tr></thead><tbody><tr><td>行一<br>行二</td></tr></tbody></table>';
  assert.equal(createTurndown().turndown(html), '| K |\n| --- |\n| 行一<br>行二 |');
});

test('flattens block elements inserted into a cell by contenteditable', () => {
  const html = '<table><thead><tr><th>K</th></tr></thead><tbody><tr><td><div>行一</div><div>行二</div></td></tr></tbody></table>';
  assert.equal(createTurndown().turndown(html), '| K |\n| --- |\n| 行一<br>行二 |');
});

test('keeps empty cells so columns stay aligned', () => {
  const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td></td><td>2</td></tr></tbody></table>';
  assert.equal(createTurndown().turndown(html), '| A | B |\n| --- | --- |\n|  | 2 |');
});

test('adds a synthetic header for tables without a heading row', () => {
  const html = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  assert.equal(createTurndown().turndown(html), '|   |   |\n| --- | --- |\n| a | b |');
});

test('expands colspan into extra columns', () => {
  const html = '<table><thead><tr><th colspan="2">宽</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
  assert.equal(createTurndown().turndown(html), '| 宽 | |\n| --- | --- |\n| a | b |');
});
