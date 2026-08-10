// 文档 → 所属工程根的定位。Agent 模式把子进程的工作目录设成这里，
// 等价于用户「在那个目录下敲 claude」：CLI 自己会读该工程的 CLAUDE.md、代码与 git 状态。
// 安全前提：网页版的 localPath 可能是「文件夹名/相对路径」这种展示用路径，
// 只有绝对且真实存在的目录才允许当作工作目录。
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, parse } from 'node:path';

// 命中即认定为工程根，从近到远第一个命中的目录胜出。
const PROJECT_MARKERS = [
  '.git',
  'CLAUDE.md',
  'AGENTS.md',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  '.codex'
];

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function projectRootFor(localPath) {
  if (typeof localPath !== 'string' || !localPath || !isAbsolute(localPath)) return '';
  const start = dirname(localPath);
  if (!isDirectory(start)) return '';
  const { root } = parse(start);
  let current = start;
  while (true) {
    if (PROJECT_MARKERS.some((marker) => existsSync(join(current, marker)))) return current;
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // 没有任何工程标记：退回文件所在目录，至少让 agent 看得见同目录的素材。
  return start;
}
