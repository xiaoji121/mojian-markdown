import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const MAX_FILE_LINES = 800;
const MAX_FUNCTION_LINES = 140;
const INCLUDED = new Set(['.css', '.html', '.js', '.ts']);
const IGNORED_DIRS = new Set(['.git', 'dist', 'node_modules', 'public/uploads']);
const IGNORED_FILES = new Set(['package-lock.json', 'src/dc-runtime.js']);

function extension(filePath) {
  const index = filePath.lastIndexOf('.');
  return index >= 0 ? filePath.slice(index) : '';
}

function shouldIgnoreDir(dir) {
  const rel = relative(ROOT, dir);
  return IGNORED_DIRS.has(rel) || IGNORED_DIRS.has(dir.split('/').pop());
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const filePath = join(dir, name);
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      if (shouldIgnoreDir(filePath)) continue;
      walk(filePath, files);
    } else {
      files.push(filePath);
    }
  }
  return files;
}

const oversized = walk(ROOT)
  .map((filePath) => {
    const rel = relative(ROOT, filePath);
    if (IGNORED_FILES.has(rel) || !INCLUDED.has(extension(rel))) return null;
    const lines = readFileSync(filePath, 'utf8').split('\n').length;
    return { file: rel, lines };
  })
  .filter(Boolean)
  .filter((item) => item.lines > MAX_FILE_LINES)
  .sort((a, b) => b.lines - a.lines);

if (oversized.length) {
  console.error(`Files over ${MAX_FILE_LINES} lines:`);
  for (const item of oversized) {
    console.error(`- ${item.file}: ${item.lines}`);
  }
  process.exit(1);
}

function functionBlocks(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const pattern = /^(?:\s{0,2}(?:async\s+)?(?:get\s+)?[A-Za-z_$][\w$]*\([^)]*\)\s*\{|\s{0,2}(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{)/gm;
  const blocks = [];
  let match;
  while ((match = pattern.exec(text))) {
    const openBrace = text.indexOf('{', match.index);
    let depth = 0;
    let end = openBrace;
    for (; end < text.length; end++) {
      if (text[end] === '{') depth++;
      if (text[end] === '}') {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    blocks.push({
      name: match[0].trim().replace(/\s*\{.*/, ''),
      lines: text.slice(match.index, end).split('\n').length
    });
  }
  return blocks;
}

const oversizedFunctions = walk(ROOT)
  .flatMap((filePath) => {
    const rel = relative(ROOT, filePath);
    if (IGNORED_FILES.has(rel) || !new Set(['.js', '.ts']).has(extension(rel))) return [];
    return functionBlocks(filePath).map((block) => ({ file: rel, ...block }));
  })
  .filter((item) => item.lines > MAX_FUNCTION_LINES)
  .sort((a, b) => b.lines - a.lines);

if (oversizedFunctions.length) {
  console.error(`Functions/methods over ${MAX_FUNCTION_LINES} lines:`);
  for (const item of oversizedFunctions) {
    console.error(`- ${item.file}: ${item.name} (${item.lines})`);
  }
  process.exit(1);
}

console.log(`All checked files are <= ${MAX_FILE_LINES} lines.`);
console.log(`All checked functions/methods are <= ${MAX_FUNCTION_LINES} lines.`);
