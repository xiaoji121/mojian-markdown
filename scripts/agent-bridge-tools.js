// 内置 Agent 工具。工程读取先 realpath 并确认仍在根内；当前文档写入只有在
// 本轮授权后才暴露，且执行时仍需一次性审批、版本校验与原子替换。
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import {
  atomicReplaceDocument,
  buildMarkdownDiff,
  documentVersion
} from './agent-bridge-document-write.js';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_OUTPUT_CHARS = 20_000;
const MAX_LIST_FILES = 200;
const SENSITIVE_NAMES = /^(\.env(?:\..*)?|\.npmrc|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519)|credentials(?:\.json)?|secrets?\.json)$/i;
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'dist-extension', '.reading-workspace']);

function pageText(text, offset = 0, limit = 8000) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(MAX_OUTPUT_CHARS, Math.max(1, Number(limit) || 8000));
  return {
    content: text.slice(safeOffset, safeOffset + safeLimit),
    offset: safeOffset,
    totalChars: text.length,
    truncated: safeOffset + safeLimit < text.length
  };
}

function ensureNotSensitive(path) {
  if (String(path).split(/[\\/]/).some((part) => SENSITIVE_NAMES.test(part))) {
    throw new Error('出于安全考虑，不能读取敏感文件');
  }
}

async function safeProjectPath(projectRoot, requested) {
  if (!projectRoot) throw new Error('当前文档没有可读取的工程目录');
  ensureNotSensitive(requested);
  const root = await realpath(projectRoot);
  const unresolved = resolve(root, requested);
  if (unresolved !== root && !unresolved.startsWith(root + sep)) throw new Error('文件不在允许的工程目录内');
  const target = await realpath(unresolved);
  if (target !== root && !target.startsWith(root + sep)) throw new Error('文件不在允许的工程目录内');
  return { root, target };
}

async function readTextFile(path) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error('目标不是文件');
  if (info.size > MAX_FILE_BYTES) throw new Error('文件过大，暂不读取');
  return readFile(path, 'utf8');
}

async function walkFiles(root, dir = root, result = []) {
  if (result.length >= MAX_LIST_FILES) return result;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (result.length >= MAX_LIST_FILES) break;
    if (entry.isSymbolicLink() || (entry.isDirectory() && IGNORED_DIRS.has(entry.name))) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(root, full, result);
    else if (entry.isFile() && !SENSITIVE_NAMES.test(entry.name)) result.push(relative(root, full));
  }
  return result;
}

export function createBuiltinAgentTools({
  projectRoot,
  scratchFile,
  allowWrite = false,
  requestId = '',
  requestApproval
}) {
  const tools = {
    read_current_document: tool({
      description: '分页读取墨笺编辑器中的当前 Markdown 文档',
      inputSchema: z.object({
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(MAX_OUTPUT_CHARS).optional()
      }),
      execute: async ({ offset, limit }) => {
        const content = await readTextFile(scratchFile);
        return { ...pageText(content, offset, limit), version: documentVersion(content) };
      }
    }),
    read_project_file: tool({
      description: '读取当前文档所属工程内的文本文件；不能读取凭据或工程外文件',
      inputSchema: z.object({
        path: z.string().min(1),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(MAX_OUTPUT_CHARS).optional()
      }),
      execute: async ({ path, offset, limit }) => {
        const { target } = await safeProjectPath(projectRoot, path);
        return { path, ...pageText(await readTextFile(target), offset, limit) };
      }
    }),
    list_project_files: tool({
      description: '列出当前工程的文件路径，自动忽略依赖、构建结果和敏感文件',
      inputSchema: z.object({}),
      execute: async () => {
        const { root } = await safeProjectPath(projectRoot, '.');
        const files = await walkFiles(root);
        return { files, truncated: files.length >= MAX_LIST_FILES };
      }
    }),
    search_project_text: tool({
      description: '在当前工程的普通文本文件中搜索字符串',
      inputSchema: z.object({ query: z.string().min(1).max(200) }),
      execute: async ({ query }) => {
        const { root } = await safeProjectPath(projectRoot, '.');
        const files = await walkFiles(root);
        const matches = [];
        for (const path of files) {
          if (matches.length >= 50) break;
          try {
            const text = await readTextFile(resolve(root, path));
            const index = text.toLowerCase().indexOf(query.toLowerCase());
            if (index >= 0) matches.push({ path, excerpt: text.slice(Math.max(0, index - 80), index + query.length + 120) });
          } catch {}
        }
        return { query, matches, truncated: matches.length >= 50 };
      }
    })
  };
  if (!allowWrite || typeof requestApproval !== 'function') return tools;
  tools.replace_current_document = tool({
    description: '替换墨笺当前 Markdown 文档。必须先读取当前文档并使用返回的最新 version；执行前会让用户确认 diff',
    inputSchema: z.object({
      content: z.string().max(MAX_FILE_BYTES),
      expectedVersion: z.string().min(1),
      summary: z.string().max(400).optional()
    }),
    execute: async ({ content, expectedVersion, summary }) => {
      const current = await readTextFile(scratchFile);
      if (documentVersion(current) !== expectedVersion) throw new Error('当前文档版本已变化，请重新读取后再修改');
      if (current === content) return { applied: false, reason: '正文没有变化', version: expectedVersion };
      const diff = buildMarkdownDiff(current, content);
      const approved = await requestApproval({
        requestId,
        toolName: 'replace_current_document',
        args: { expectedVersion, content },
        summary: String(summary || '替换当前文档'),
        diff
      });
      if (!approved) return { applied: false, reason: '用户未批准这次修改', version: expectedVersion };
      const result = await atomicReplaceDocument(scratchFile, content, expectedVersion);
      return { applied: true, ...result, addedLines: diff.addedLines, removedLines: diff.removedLines };
    }
  });
  return tools;
}
