import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, matchesGlob, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const config = readFileSync(resolve(root, 'desktop/electron-builder.yml'), 'utf8');
// This config uses a plain YAML string list. Reject other shapes rather than
// silently ignoring a future FileSet or other packaging configuration change.
const fileList = config.match(/^files:\s*\n((?:[ \t]+.*\n)*)/m)?.[1];
assert.ok(fileList, 'electron-builder config must declare its packaged files');
const patterns = fileList.trim().split('\n').map((line) => {
  const item = line.trim().match(/^-\s+(?:"([^"]+)"|'([^']+)'|([^#]+?))\s*$/);
  assert.ok(item, `Unsupported packaging file pattern: ${line}`);
  return (item[1] ?? item[2] ?? item[3]).trim();
});

function included(file: string, productionDependency = false) {
  // electron-builder adds package.json and production node_modules itself.
  const positive = productionDependency || file === 'package.json'
    || patterns.some((pattern) => !pattern.startsWith('!') && matchesGlob(file, pattern));
  return positive && !patterns.some((pattern) => pattern.startsWith('!') && matchesGlob(file, pattern.slice(1)));
}

function bridgeImports() {
  const local = new Set<string>();
  const external = new Set<string>();
  function visit(file: string) {
    if (local.has(file)) return;
    local.add(file);
    const source = readFileSync(resolve(root, file), 'utf8');
    for (const match of source.matchAll(/\b(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) {
        visit(relative(root, resolve(root, dirname(file), specifier)).replaceAll('\\', '/'));
      } else if (!specifier.startsWith('node:')) {
        external.add(specifier);
      }
    }
  }
  visit('scripts/agent-bridge.js');
  return { local, external };
}

test('desktop package includes the complete local bridge import graph', () => {
  const missing = [...bridgeImports().local].filter((file) => !included(file));
  assert.deepEqual(missing, [], `Missing packaged bridge modules: ${missing.join(', ')}`);
});

test('desktop package retains bridge production dependencies', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  for (const specifier of bridgeImports().external) {
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    assert.ok(manifest.dependencies[name], `${name} must be a production dependency`);
    assert.ok(included(`node_modules/${name}/package.json`, true), `${name} is excluded from the desktop package`);
    assert.ok(included(`node_modules/${name}/index.js`, true), `${name} runtime is excluded from the desktop package`);
  }
});
