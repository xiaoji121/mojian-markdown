// 把 Agent 回答里指向当前工程的 Markdown 文件导入 Reading Workspace。
// 只接受真实路径仍位于工程根内的文件，避免回答中的任意链接变成本地文件读取入口。
import { readFile, realpath } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';

function markdownHrefs(answer) {
  const hrefs = [];
  const pattern = /\[[^\]]*\]\(\s*<?([^\n)>]+?\.(?:md|markdown))>?(?:\s+["'][^)]*["'])?\s*\)/gi;
  for (const match of String(answer || '').matchAll(pattern)) hrefs.push(match[1].trim());
  return [...new Set(hrefs)];
}

function isInside(root, file) {
  return file === root || file.startsWith(root + sep);
}

function localMarkdownPath(href, projectRoot) {
  if (!href || !projectRoot || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('#')) return '';
  let decoded = href;
  try { decoded = decodeURIComponent(href); } catch {}
  const withoutQuery = decoded.split(/[?#]/, 1)[0];
  if (!['.md', '.markdown'].includes(extname(withoutQuery).toLowerCase())) return '';
  return resolve(projectRoot, withoutQuery);
}

export async function importAgentMarkdownArtifacts(answer, context, upsertDocument) {
  if (!context?.projectRoot) return [];
  let projectRoot = '';
  try { projectRoot = await realpath(context.projectRoot); } catch { return []; }
  const artifacts = [];
  for (const href of markdownHrefs(answer)) {
    const candidate = localMarkdownPath(href, projectRoot);
    if (!candidate) continue;
    try {
      const localPath = await realpath(candidate);
      if (!isInside(projectRoot, localPath)) continue;
      const content = await readFile(localPath, 'utf8');
      const fileName = basename(localPath);
      const document = await upsertDocument({
        sourceApp: 'agent-generated', title: fileName, fileName, content, localPath
      });
      artifacts.push({ href, documentId: document.documentId, fileName, localPath });
    } catch {}
  }
  return artifacts;
}
