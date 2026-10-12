import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, utimesSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const source = 'b'.repeat(40);
const oldSource = 'a'.repeat(40);
const workflow = readFileSync(new URL('../../.github/workflows/mojian-pages.yml', import.meta.url), 'utf8');
// Exercise the actual pre-commit workflow block without its git push commands.
const block = workflow.match(/- name: Update the existing Pages publication branch\n        run: \|\n([\s\S]*?)          git -C publication config user.name/)?.[1];
assert.ok(block, 'publication workflow must expose its pre-commit preparation');
const prepare = block.replace(/^          /gm, '');
const marker = (sha: string) => JSON.stringify({ source: sha, site: 'https://mojian.uk/' });
const hasRsync = spawnSync('rsync', ['--version']).status === 0;

function fixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mojian-publication-'));
  try {
    for (const directory of ['site/assets', 'publication/assets', 'publication/.git']) mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, 'site/deployment.json'), marker(source));
    writeFileSync(join(root, 'publication/deployment.json'), marker(oldSource));
    writeFileSync(join(root, 'site/assets/app.css'), 'new');
    writeFileSync(join(root, 'publication/assets/app.css'), 'old');
    writeFileSync(join(root, 'publication/assets/obsolete.css'), 'obsolete');
    writeFileSync(join(root, 'publication/.git/keep'), 'git metadata');
    // Both checkout and artifact extraction can land in the same rsync timestamp second.
    for (const directory of ['site', 'publication']) {
      for (const file of ['deployment.json', 'assets/app.css']) utimesSync(join(root, directory, file), 1_800_000_000, 1_800_000_000);
    }
    run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function runPreparation(root: string, path = process.env.PATH) {
  return spawnSync('bash', ['-e', '-c', prepare], {
    cwd: root, env: { ...process.env, PATH: path, GITHUB_SHA: source }, encoding: 'utf8',
  });
}

test('publication replaces same-size same-time content and preserves git metadata', { skip: !hasRsync }, () => fixture(root => {
  const result = runPreparation(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, 'publication/deployment.json'), 'utf8'), marker(source));
  assert.equal(readFileSync(join(root, 'publication/assets/app.css'), 'utf8'), 'new');
  assert.equal(existsSync(join(root, 'publication/assets/obsolete.css')), false);
  assert.equal(readFileSync(join(root, 'publication/.git/keep'), 'utf8'), 'git metadata');
  assert.equal(readFileSync(join(root, 'publication/CNAME'), 'utf8'), 'mojian.uk\n');
  assert.ok(existsSync(join(root, 'publication/.nojekyll')));
}));

test('an artifact from another source is rejected before publication changes', { skip: !hasRsync }, () => fixture(root => {
  writeFileSync(join(root, 'site/deployment.json'), marker('c'.repeat(40)));
  const result = runPreparation(root);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(join(root, 'publication/deployment.json'), 'utf8'), marker(oldSource));
}));

test('a successful sync command that leaves stale bytes cannot pass verification', { skip: !hasRsync }, () => fixture(root => {
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'rsync'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = runPreparation(root, `${bin}:${process.env.PATH}`);
  assert.notEqual(result.status, 0, 'stale artifact contents must block the git commit');
}));
