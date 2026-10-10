import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExportBackupMethods } from '../../src/editor/exportBackupMethods.ts';
import { EditingFileLayoutMethods } from '../../src/editor/editingFileLayoutMethods.ts';
import { getSample } from '../../src/editor/sample.ts';

test('_shouldConfirmLeave 浏览器草稿有内容需确认，样例无批注可跳过', () => {
  const editor = Object.create(ExportBackupMethods.prototype);
  Object.assign(editor, {
    fileHandle: null,
    localFilePath: '',
    dirty: false,
    comments: [],
    fileName: '笔记.md',
    sourceRef: { current: { value: '# 我的草稿' } }
  });
  assert.equal(editor._shouldConfirmLeave(), true);

  const sample = getSample('zh-CN');
  editor.fileName = sample.fileName;
  editor.sourceRef.current.value = sample.markdown;
  assert.equal(editor._shouldConfirmLeave(), false);
  editor.comments = [{ id: '1' }];
  assert.equal(editor._shouldConfirmLeave(), true);
});

test('downloadSourceMarkdown 只下载正文', () => {
  const editor = Object.create(ExportBackupMethods.prototype);
  const downloads: Array<{ name: string; text: string }> = [];
  Object.assign(editor, {
    fileName: '文章.md',
    comments: [{ id: '1', quote: 'x', type: 'idea', note: 'n', ts: 1 }],
    sourceRef: { current: { value: '# 正文\n' } },
    _downloadTextFile(text: string, name: string) { downloads.push({ name, text }); },
    _setStatus() {}
  });
  editor.downloadSourceMarkdown();
  assert.deepEqual(downloads, [{ name: '文章.md', text: '# 正文\n' }]);
});

test('downloadAnnotationsMarkdown 写出标题引用与想法', () => {
  const editor = Object.create(ExportBackupMethods.prototype);
  const downloads: Array<{ name: string; text: string }> = [];
  Object.assign(editor, {
    fileName: '文章.md',
    comments: [{ id: '1', quote: '摘录', type: 'idea', note: '想法A', ts: Date.parse('2026-10-10T05:00:00Z') }],
    sourceRef: { current: { value: '# 正文' } },
    _typeLabel(type: string) { return type === 'idea' ? '想法' : type; },
    _downloadTextFile(text: string, name: string) { downloads.push({ name, text }); },
    _setStatus() {}
  });
  editor.downloadAnnotationsMarkdown();
  assert.equal(downloads[0].name, '文章.annotations.md');
  assert.match(downloads[0].text, /批注（共 1 条）/);
  assert.match(downloads[0].text, /^> 摘录$/m);
  assert.match(downloads[0].text, /想法A/);
  assert.doesNotMatch(downloads[0].text, /# 正文/);
});

test('onNew 对已恢复的浏览器草稿（dirty=false）也会确认', () => {
  const confirms: string[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { confirm(msg: string) { confirms.push(msg); return false; } }
  });
  try {
    const editor = Object.create(EditingFileLayoutMethods.prototype);
    Object.assign(editor, {
      dirty: false,
      fileHandle: null,
      localFilePath: '',
      fileName: '恢复的草稿.md',
      comments: [],
      sourceRef: { current: { value: '# 重要内容', focus() {} } },
      viewMode: 'split',
      setViewMode() { throw new Error('should not clear'); }
    });
    editor.onNew();
    assert.equal(confirms.length, 1);
    assert.match(confirms[0], /下载备份|backup/i);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete (globalThis as { window?: unknown }).window;
  }
});
