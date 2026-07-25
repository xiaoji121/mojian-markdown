// 一次性清理 Reading Workspace 里历史遗留的同名重复文档：
//   node scripts/dedupe-reading-workspace.js [--dry-run]
// 同名文档合并为最近更新的一份（批注按 id、问答按 requestId 去重合并），其余删除。
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createDocumentStore } from './agent-bridge-store.js';

const ROOT = process.env.AGENT_BRIDGE_WORKSPACE || join(process.cwd(), '.reading-workspace');
const dryRun = process.argv.includes('--dry-run');
const store = createDocumentStore(ROOT);

const groups = new Map();
for (const doc of await store.listDocuments()) {
  if (!doc.fileName || doc.fileName === '未命名.md' || doc.fileName === '未命名文档') continue;
  // 已知本地路径的文档按路径分组；不同目录下的同名文件是不同文档，不合并。
  const key = doc.localPath || doc.fileName;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(doc);
}

let removed = 0;
for (const [fileName, group] of groups) {
  if (group.length < 2) continue;
  // listDocuments 按 updatedAt 倒序，第一份最新，作为保留基准。
  const [base, ...rest] = group;
  const annotations = new Map((base.annotations || []).map((item) => [item.id || item.requestId, item]));
  const messages = new Map((base.messages || []).map((item) => [item.requestId, item]));
  let createdAt = base.createdAt;
  for (const doc of rest) {
    for (const item of doc.annotations || []) {
      const key = item.id || item.requestId;
      if (!annotations.has(key)) annotations.set(key, item);
    }
    for (const item of doc.messages || []) {
      if (!messages.has(item.requestId)) messages.set(item.requestId, item);
    }
    if (doc.createdAt && doc.createdAt < createdAt) createdAt = doc.createdAt;
  }
  base.annotations = [...annotations.values()];
  base.messages = [...messages.values()]
    .sort((a, b) => String(a.questionAt || '').localeCompare(String(b.questionAt || '')));
  base.createdAt = createdAt;
  console.log(`合并「${fileName}」: 保留 ${base.documentId}，删除 ${rest.length} 份副本`);
  if (!dryRun) {
    await store.writeDocument(base);
    for (const doc of rest) {
      await unlink(store.documentPath(doc.documentId));
      removed += 1;
    }
  }
}

console.log(dryRun ? '（dry-run 模式，未做任何修改）' : `完成：删除 ${removed} 份重复副本`);
