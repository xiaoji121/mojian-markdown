// 当前文档受控写入：生成适合审批展示的紧凑 diff，并通过同目录临时文件原子替换。
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const MAX_DIFF_LINES = 120;
const MAX_DIFF_CHARS = 12_000;
const DIFF_CONTEXT_LINES = 3;

export function documentVersion(content) {
  return createHash('sha256').update(String(content || '')).digest('hex');
}

function changedRange(before, after) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;
  return { prefix, suffix };
}

export function buildMarkdownDiff(beforeContent, afterContent) {
  const before = String(beforeContent || '').split('\n');
  const after = String(afterContent || '').split('\n');
  const { prefix, suffix } = changedRange(before, after);
  const removed = before.slice(prefix, before.length - suffix);
  const added = after.slice(prefix, after.length - suffix);
  const contextBefore = before.slice(Math.max(0, prefix - DIFF_CONTEXT_LINES), prefix);
  const contextAfter = suffix
    ? before.slice(before.length - suffix, before.length - suffix + DIFF_CONTEXT_LINES)
    : [];
  const lines = [
    ...contextBefore.map((line) => '  ' + line),
    ...removed.map((line) => '- ' + line),
    ...added.map((line) => '+ ' + line),
    ...contextAfter.map((line) => '  ' + line)
  ];
  const lineLimited = lines.slice(0, MAX_DIFF_LINES).join('\n');
  const truncated = lines.length > MAX_DIFF_LINES || lineLimited.length > MAX_DIFF_CHARS;
  const marker = '\n… diff 已截断';
  const preview = truncated
    ? lineLimited.slice(0, MAX_DIFF_CHARS - marker.length) + marker
    : lineLimited;
  return {
    preview,
    addedLines: added.length,
    removedLines: removed.length,
    truncated
  };
}

export async function atomicReplaceDocument(path, content, expectedVersion) {
  const current = await readFile(path, 'utf8');
  if (documentVersion(current) !== expectedVersion) throw new Error('当前文档版本已变化，请重新读取后再修改');
  const info = await stat(path);
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, String(content), { encoding: 'utf8', mode: info.mode });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return { version: documentVersion(content) };
}
