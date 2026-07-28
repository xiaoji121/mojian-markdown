// Reading Workspace 文档存储。从 agent-bridge.js 中拆出，便于单测与 CLI 脚本复用。
// 关键行为：同名文档视为同一篇，重复上报时复用既有文档，不再生成副本。
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// 默认名视为「还没有身份」的文档，不参与同名合并。
const UNNAMED_FILES = new Set(['未命名.md', '未命名文档']);

export function normalizeAnnotation(item) {
  const id = item.id || item.requestId || randomUUID();
  return { ...item, id, ts: item.ts || Date.now() };
}

function normalizeDocument(input, existing = null) {
  const now = new Date().toISOString();
  return {
    sourceApp: input.sourceApp || existing?.sourceApp || 'markdown-editor',
    title: input.title || input.fileName || existing?.title || '未命名文档',
    fileName: input.fileName || input.title || existing?.fileName || '未命名.md',
    localPath: input.localPath || existing?.localPath || undefined,
    content: input.content ?? existing?.content ?? '',
    documentId: existing?.documentId || input.documentId || randomUUID(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    annotations: existing?.annotations || [],
    messages: existing?.messages || []
  };
}

export function createDocumentStore(root) {
  const documentDir = join(root, 'documents');
  const documentPath = (documentId) => join(documentDir, `${documentId}.json`);

  async function ensureStore() {
    await mkdir(documentDir, { recursive: true });
  }

  async function readDocument(documentId) {
    return JSON.parse(await readFile(documentPath(documentId), 'utf8'));
  }

  async function writeDocument(doc) {
    await ensureStore();
    doc.updatedAt = new Date().toISOString();
    await writeFile(documentPath(doc.documentId), JSON.stringify(doc, null, 2));
    return doc;
  }

  async function listDocuments() {
    await ensureStore();
    const names = await readdir(documentDir);
    const docs = await Promise.all(
      names.filter((name) => name.endsWith('.json')).map(async (name) => {
        try {
          return JSON.parse(await readFile(join(documentDir, name), 'utf8'));
        } catch {
          return null;
        }
      })
    );
    return docs.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  // 文档身份识别：本地路径完全一致视为同一篇；否则退回同名匹配，
  // 但明确位于其他路径的同名文档不参与合并（不同目录下的同名文件是不同文档）。
  // 历史上可能已产生多份同名副本：优先带问答记录的那份，其余按最近更新兜底。
  async function findDocumentByIdentity(fileName, localPath = '') {
    const docs = await listDocuments();
    if (localPath) {
      const byPath = docs.find((doc) => doc.localPath === localPath);
      if (byPath) return byPath;
    }
    if (!fileName || UNNAMED_FILES.has(fileName)) return null;
    let sameName = docs.filter((doc) => doc.fileName === fileName);
    if (localPath) sameName = sameName.filter((doc) => !doc.localPath);
    return sameName.find((doc) => Array.isArray(doc.messages) && doc.messages.length) || sameName[0] || null;
  }

  async function deleteDocument(documentId) {
    // id 来自 URL，只接受安全字符，防止拼路径逃出存储目录。
    if (!documentId || !/^[\w.-]+$/.test(documentId)) return;
    await rm(documentPath(documentId), { force: true });
  }

  async function upsertDocument(input, annotations = null) {
    let existing = null;
    if (input.documentId && existsSync(documentPath(input.documentId))) {
      existing = await readDocument(input.documentId);
    }
    if (!existing) existing = await findDocumentByIdentity(input.fileName || input.title, input.localPath);
    const doc = normalizeDocument(input, existing);
    if (Array.isArray(annotations)) doc.annotations = annotations.map(normalizeAnnotation);
    return writeDocument(doc);
  }

  return {
    documentDir,
    documentPath,
    ensureStore,
    readDocument,
    writeDocument,
    deleteDocument,
    listDocuments,
    findDocumentByIdentity,
    upsertDocument
  };
}
