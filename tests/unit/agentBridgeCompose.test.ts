import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectPathNodes,
  composePrompt,
  composedFileName,
  composedDocumentContent,
  normalizeComposeMode
} from '../../scripts/agent-bridge-compose.js';

// 一棵典型追问树：主文档 → a1（摘录回答）→ m1（AI 问答）→ m2（AI 追问），
// 外加挂在各节点下的用户批注与主文档划线。
const sampleDoc = {
  documentId: 'doc-1',
  fileName: 'How to Get Rich.md',
  title: 'How to Get Rich.md',
  content: '# 原文\n\n财富是你睡觉时也在为你赚钱的资产。',
  messages: [
    {
      requestId: 'm1', engine: 'gemini', question: '我们应该如何去追求财富',
      quote: '财富的定义', answer: '追求资产而非地位。', parentRequestId: 'a1',
      questionAt: '2026-07-30T08:19:00.000Z', answerAt: '2026-07-30T08:20:00.000Z'
    },
    {
      requestId: 'm2', engine: 'claude', question: '这句话是不是在制造焦虑',
      quote: '追求资产', answer: '这更像是提供路径而非贩卖焦虑。', parentRequestId: 'm1',
      questionAt: '2026-07-30T08:22:00.000Z', answerAt: '2026-07-30T08:23:00.000Z'
    },
    { requestId: 'm-pending', question: '还没有回答的问题', parentRequestId: 'm1', answer: '' }
  ],
  annotations: [
    { id: 'a1', type: 'idea', quote: '这篇文章对财富的定义', note: '财富是怎样定义的', reply: '资产而非现金流。', ts: 1753830000000 },
    { id: 'note-on-m1', type: 'idea', quote: '资产', note: '这里的资产指什么？', answerRequestId: 'm1', ts: 1753830100000 },
    { id: 'mark-doc', type: 'marker', quote: '睡觉时也在赚钱', note: '', ts: 1753830200000 },
    { id: 'note-elsewhere', type: 'idea', quote: '别的分支', note: '不相关批注', answerRequestId: 'm-pending', ts: 1753830300000 }
  ]
};

test('normalizeComposeMode 只认识 article 与 remix', () => {
  assert.equal(normalizeComposeMode('remix'), 'remix');
  assert.equal(normalizeComposeMode('article'), 'article');
  assert.equal(normalizeComposeMode('anything'), 'article');
  assert.equal(normalizeComposeMode(undefined), 'article');
});

test('collectPathNodes 按追问层级从浅到深排列并带上节点批注', () => {
  const nodes = collectPathNodes(sampleDoc, ['m2', 'a1', 'm1']);

  assert.deepEqual(nodes.map((node) => node.requestId), ['a1', 'm1', 'm2'], '乱序输入按树深度重排');
  const [a1, m1, m2] = nodes;
  assert.equal(a1.kind, 'reply');
  assert.equal(a1.question, '财富是怎样定义的');
  assert.equal(a1.answer, '资产而非现金流。');
  assert.equal(m1.kind, 'qa');
  assert.equal(m1.answer, '追求资产而非地位。');
  assert.equal(m1.annotations.length, 1, 'm1 视图里写的批注归属 m1');
  assert.equal(m1.annotations[0].note, '这里的资产指什么？');
  assert.equal(m2.annotations.length, 0);
});

test('collectPathNodes 空串代表主文档节点，收入主文档层批注与划线', () => {
  const nodes = collectPathNodes(sampleDoc, ['', 'm1']);

  assert.equal(nodes[0].kind, 'document');
  assert.equal(nodes[0].requestId, '');
  const quotes = nodes[0].annotations.map((item) => item.quote);
  assert.ok(quotes.includes('睡觉时也在赚钱'), '纯划线也计入主文档批注');
  assert.ok(!quotes.includes('别的分支'), '挂在其他子文档下的批注不进主文档节点');
});

test('collectPathNodes 忽略未知节点、无回答消息与重复选择', () => {
  const nodes = collectPathNodes(sampleDoc, ['m-pending', 'nope', 'm1', 'm1']);
  assert.deepEqual(nodes.map((node) => node.requestId), ['m1']);
});

test('composePrompt 汇入原文、路径节点与批注，两种模式给出不同任务', () => {
  const nodes = collectPathNodes(sampleDoc, ['a1', 'm1', 'm2']);
  const article = composePrompt({ doc: sampleDoc, nodes, mode: 'article' });

  assert.match(article, /How to Get Rich\.md/);
  assert.match(article, /睡觉时也在为你赚钱/, '原文全文在场');
  assert.match(article, /财富是怎样定义的/);
  assert.match(article, /我们应该如何去追求财富/);
  assert.match(article, /这更像是提供路径而非贩卖焦虑/);
  assert.match(article, /这里的资产指什么/, '节点批注进入上下文');
  assert.match(article, /整理成一篇/, 'article 模式是整理长文');

  const remix = composePrompt({ doc: sampleDoc, nodes, mode: 'remix', instruction: '用第一人称写' });
  assert.match(remix, /全新的原创文章/, 'remix 模式是二创');
  assert.match(remix, /用第一人称写/, '补充要求透传');
});

test('composedFileName 去扩展名并带模式标签与时间戳', () => {
  const name = composedFileName(sampleDoc, 'article', new Date('2026-07-31T16:42:00'));
  assert.equal(name, 'How to Get Rich · 路径长文 0731-1642.md');
  const remix = composedFileName({ fileName: '未命名.md' }, 'remix', new Date('2026-01-02T03:04:00'));
  assert.match(remix, /未命名 · 路径二创 0102-0304\.md/);
});

test('composedDocumentContent 在标题后插入来源行，无标题时前置', () => {
  const nodes = collectPathNodes(sampleDoc, ['a1', 'm1']);
  const withTitle = composedDocumentContent('# 我的长文\n\n正文开始', { doc: sampleDoc, nodes, mode: 'article' });
  const lines = withTitle.split('\n');
  assert.equal(lines[0], '# 我的长文');
  assert.match(lines[2], /^> 由「阅读脉络 · 路径长文」生成 · 来源：How to Get Rich\.md · 2 个节点$/);
  assert.match(withTitle, /正文开始/);

  const noTitle = composedDocumentContent('正文直接开始', { doc: sampleDoc, nodes, mode: 'remix' });
  assert.match(noTitle.split('\n')[0], /^> 由「阅读脉络 · 路径二创」生成/);
});
