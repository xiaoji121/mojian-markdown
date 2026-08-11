import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  atomicReplaceDocument,
  buildMarkdownDiff,
  documentVersion
} from '../../scripts/agent-bridge-document-write.js';

test('Markdown diff 展示增删内容与统计', () => {
  const diff = buildMarkdownDiff('# 标题\n旧段落\n结尾', '# 标题\n新段落\n结尾');

  assert.match(diff.preview, /- 旧段落/);
  assert.match(diff.preview, /\+ 新段落/);
  assert.equal(diff.addedLines, 1);
  assert.equal(diff.removedLines, 1);
});

test('Markdown diff 限制审批预览体积，避免超长单行撑爆界面', () => {
  const diff = buildMarkdownDiff('旧'.repeat(20_000), '新'.repeat(20_000));

  assert.ok(diff.preview.length <= 12_020);
  assert.equal(diff.truncated, true);
  assert.match(diff.preview, /diff 已截断/);
});

test('原子替换校验版本，成功写入且版本冲突不覆盖', async () => {
  const root = await mkdtemp(join(tmpdir(), 'document-write-'));
  const file = join(root, 'current.md');
  try {
    await writeFile(file, '# 旧正文', 'utf8');
    const version = documentVersion('# 旧正文');
    const result = await atomicReplaceDocument(file, '# 新正文', version);
    assert.equal(await readFile(file, 'utf8'), '# 新正文');
    assert.equal(result.version, documentVersion('# 新正文'));

    await assert.rejects(
      () => atomicReplaceDocument(file, '# 不应写入', version),
      /版本已变化/
    );
    assert.equal(await readFile(file, 'utf8'), '# 新正文');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
