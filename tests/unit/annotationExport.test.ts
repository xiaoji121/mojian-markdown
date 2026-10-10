import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annotationSidecarFileName,
  annotationsMarkdownFileName,
  backupZipFileName,
  buildAnnotationSidecar,
  buildBackupPackageFiles,
  formatAnnotationTimestamp,
  formatAnnotationsMarkdown,
  shouldConfirmLeave,
  sourceBaseName,
  sourceMarkdownFileName
} from '../../src/editor/annotationExport.ts';

const typeLabel = (type: string) => ({ idea: '想法', marker: '马克笔', ai: 'AI 问答' }[type] || '批注');

test('sidecar 与导出文件名跟源文同目录约定', () => {
  assert.equal(sourceBaseName('读书笔记.md'), '读书笔记');
  assert.equal(sourceMarkdownFileName('读书笔记.md'), '读书笔记.md');
  assert.equal(sourceMarkdownFileName('未命名'), '未命名.md');
  assert.equal(annotationsMarkdownFileName('读书笔记.md'), '读书笔记.annotations.md');
  assert.equal(annotationSidecarFileName('读书笔记.md'), '读书笔记.annotations.json');
  assert.equal(backupZipFileName('读书笔记.md'), '读书笔记-backup.zip');
});

test('批注 Markdown 含标题、引用块、想法与时间，不改源文', () => {
  const ts = Date.parse('2026-10-10T05:21:00Z');
  const md = formatAnnotationsMarkdown('文章.md', [
    { id: '1', quote: '原文第一行\n第二行', type: 'idea', note: '这段很关键', ts }
  ], typeLabel, 'zh-CN');
  assert.match(md, /^# 《文章\.md》批注（共 1 条）/m);
  assert.match(md, /## 1 · 想法 · /);
  assert.match(md, /^> 原文第一行$/m);
  assert.match(md, /^> 第二行$/m);
  assert.match(md, /这段很关键/);
  assert.doesNotMatch(md, /# 原文/);
  assert.ok(formatAnnotationTimestamp(ts, 'en').length > 0);
});

test('AI 批注导出问题与回答字段', () => {
  const md = formatAnnotationsMarkdown('x.md', [
    { id: 'a', quote: '摘录', type: 'ai', note: '', question: '含义？', answer: '解释内容', ts: 1 }
  ], typeLabel);
  assert.match(md, /\*\*问题：\*\* 含义？/);
  assert.match(md, /\*\*回答：\*\*/);
  assert.match(md, /解释内容/);
});

test('sidecar JSON 字段完整且 version=1', () => {
  const sidecar = buildAnnotationSidecar('demo.md', [
    { id: 'c1', quote: 'q', occ: 0, start: 3, type: 'marker', note: '', ts: 42, reply: '补充' }
  ], 1_700_000_000_000);
  assert.equal(sidecar.version, 1);
  assert.equal(sidecar.sourceFile, 'demo.md');
  assert.equal(sidecar.exportedAt, new Date(1_700_000_000_000).toISOString());
  assert.equal(sidecar.annotations.length, 1);
  assert.equal(sidecar.annotations[0].reply, '补充');
  assert.equal(sidecar.annotations[0].start, 3);
});

test('备份包区分纯源文与批注资产', () => {
  const files = buildBackupPackageFiles(
    '笔记.md',
    '# 正文\n\n保持干净\n',
    [{ id: '1', quote: '干净', type: 'idea', note: '好', ts: 10 }],
    typeLabel,
    'zh-CN',
    10
  );
  assert.deepEqual(files.map((f) => f.name), [
    '笔记.md',
    '笔记.annotations.md',
    '笔记.annotations.json'
  ]);
  assert.equal(files[0].text, '# 正文\n\n保持干净\n');
  assert.match(files[1].text, /批注（共 1 条）/);
  const parsed = JSON.parse(files[2].text);
  assert.equal(parsed.sourceFile, '笔记.md');
  assert.equal(parsed.annotations[0].quote, '干净');
});

test('离开确认：浏览器草稿有内容需确认，样例无批注可跳过；有文件只看 dirty', () => {
  assert.equal(shouldConfirmLeave({
    hasFile: false, dirty: false, content: '# 草稿', commentCount: 0, pristineSample: false
  }), true);
  assert.equal(shouldConfirmLeave({
    hasFile: false, dirty: false, content: '# 欢迎', commentCount: 0, pristineSample: true
  }), false);
  assert.equal(shouldConfirmLeave({
    hasFile: false, dirty: false, content: '# 欢迎', commentCount: 2, pristineSample: true
  }), true);
  assert.equal(shouldConfirmLeave({
    hasFile: true, dirty: false, content: 'x', commentCount: 0, pristineSample: false
  }), false);
  assert.equal(shouldConfirmLeave({
    hasFile: true, dirty: true, content: 'x', commentCount: 0, pristineSample: false
  }), true);
  assert.equal(shouldConfirmLeave({
    hasFile: false, dirty: false, content: '   ', commentCount: 0, pristineSample: false
  }), false);
});
