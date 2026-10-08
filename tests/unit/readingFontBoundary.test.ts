import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReadingFontHandler } from '../../desktop/readingFontBoundary.js';
const fixture = readFileSync(new URL('../../src/fonts/source-serif-4/SourceSerif4Variable-Roman.ttf.woff2', import.meta.url));
function setup() {
  const event = { sender: {}, trusted: true }; let writes = 0; let chosen = 0;
  const handler = createReadingFontHandler({ isTrusted: e => e.trusted, store: {
    load: async () => ({ status: 'unavailable' }), remove: async () => ({ status: 'unavailable' }),
    importFont: async (bytes, name) => { writes++; assert.deepEqual(bytes, fixture); return { status: 'available', fileName: name }; }
  }, chooseFile: async () => { chosen++; return '/chosen/font.woff2'; }, projectFont: async () => ({ status: 'unavailable' }), readSelected: async () => fixture });
  return { event, handler, writes: () => writes, chosen: () => chosen };
}
test('untrusted frames cannot inspect, pick, persist or remove fonts', async () => {
  const ctx = setup();
  for (const op of ['load', 'project', 'choose', 'commit', 'remove']) {
    assert.equal((await ctx.handler({ ...ctx.event, trusted: false }, op)).error, 'untrusted');
  }
  assert.equal(ctx.chosen(), 0); assert.equal(ctx.writes(), 0);
});
test('native selection only prepares; exact opaque commit is required and single-use', async () => {
  const ctx = setup(); const result = await ctx.handler(ctx.event, 'choose');
  assert.equal(result.status, 'candidate'); assert.equal(ctx.writes(), 0);
  assert.equal((await ctx.handler(ctx.event, 'commit', { token: result.token, path: '/other' })).error, 'invalid-request');
  assert.equal((await ctx.handler(ctx.event, 'commit', { token: 'wrong' })).error, 'invalid-request');
  assert.equal((await ctx.handler(ctx.event, 'commit', { token: result.token })).status, 'available');
  assert.equal(ctx.writes(), 1);
  assert.equal((await ctx.handler(ctx.event, 'commit', { token: result.token })).error, 'invalid-request');
});
test('arbitrary paths are rejected and cancelled candidate cannot replace existing font', async () => {
  const ctx = setup();
  assert.equal((await ctx.handler(ctx.event, 'choose', { path: '/arbitrary' })).error, 'invalid-request');
  const result = await ctx.handler(ctx.event, 'choose');
  await ctx.handler(ctx.event, 'cancel');
  assert.equal((await ctx.handler(ctx.event, 'commit', { token: result.token })).error, 'invalid-request');
  assert.equal(ctx.writes(), 0);
});

test('font persistence participates in the application close drain', () => {
  const source = readFileSync(new URL('../../desktop/main.js', import.meta.url), 'utf8');
  assert.match(source, /operation === 'commit' \|\| operation === 'remove' \? trackWrite\(invoke\)/);
});

test('cancel invalidates an in-flight native picker result before any commit', async () => {
  let finish;
  const event = { sender: {} };
  const handler = createReadingFontHandler({ isTrusted: () => true, store: {},
    chooseFile: () => new Promise(resolve => { finish = resolve; }), readSelected: async () => fixture,
    projectFont: async () => ({ status: 'unavailable' }) });
  const pending = handler(event, 'choose');
  await handler(event, 'cancel');
  finish('/chosen/font.woff2');
  assert.equal((await pending).status, 'cancelled');
});

test('selected named pipes are rejected before open can block', { skip: process.platform === 'win32' }, async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { readSelectedFont } = await import('../../desktop/readingFontBoundary.js');
  const root = await mkdtemp(join(tmpdir(), 'font-pipe-'));
  try {
    const path = join(root, 'font.ttf'); execFileSync('mkfifo', [path]);
    await assert.rejects(readSelectedFont(path), /invalid-font/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
