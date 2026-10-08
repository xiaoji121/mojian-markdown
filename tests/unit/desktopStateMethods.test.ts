import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopStateMethods } from '../../src/editor/desktopStateMethods.ts';

function editor() {
  return Object.assign(Object.create(DesktopStateMethods.prototype), {
    sourceRef: { current: { value: 'last keystroke' } }, localFilePath: '/note.md', fileName: 'note.md',
    dirty: true, comments: [{ note: 'last annotation' }],
    _persist() { return true; }, _setStatus() {}, _stopLocalFileWatcher() {},
    async _maybeWriteThroughLocalFile() { this.dirty = false; }, async _flushBridgeSync() {},
    _setDirty(value) { this.dirty = value; }, _syncFileNameTooltip() {}, _startLocalFileWatcher() {},
    _cleanOpenedMarkdown: (value) => value,
  });
}

test('close flushes the immediate source/annotations and persists again after local writes', async () => {
  const ctx = editor();
  const calls = [];
  ctx._persist = () => { calls.push(['draft', ctx.sourceRef.current.value, ctx.comments[0].note]); return true; };
  ctx._maybeWriteThroughLocalFile = async () => { calls.push(['file']); ctx.dirty = false; };
  ctx._flushBridgeSync = async () => { calls.push(['bridge']); };
  assert.equal(await ctx._prepareDesktopClose(), true);
  assert.deepEqual(calls.map((c) => c[0]), ['draft', 'file', 'bridge', 'draft']);
  assert.deepEqual(calls[0].slice(1), ['last keystroke', 'last annotation']);
});

test('a failed durable draft or unresolved linked edit refuses silent close', async () => {
  const ctx = editor(); ctx._persist = () => false;
  assert.equal(await ctx._prepareDesktopClose(), false);
  ctx._persist = () => true; ctx.fileHandle = {};
  ctx._maybeWriteThroughLocalFile = async () => {};
  assert.equal(await ctx._prepareDesktopClose(), false);
});

test('restore never replaces edits typed while desktop file read is pending', async () => {
  const ctx = editor(); ctx.dirty = false;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const previous = globalThis.window;
  globalThis.window = { mojianDesktop: {
    statFile: async () => { await pending; return { lastModified: 10 }; },
    readFile: async () => ({ content: 'older disk', lastModified: 10 })
  } };
  ctx._reloadFromLocalFile = () => { throw new Error('must not replace newer edits'); };
  try {
    const restore = ctx._restoreDesktopFileLink();
    ctx.sourceRef.current.value = 'typed during restore'; ctx.dirty = true;
    release(); await restore;
    assert.equal(ctx.sourceRef.current.value, 'typed during restore');
    assert.ok(ctx.fileHandle, 'association remains active');
    assert.equal(ctx._localFileConflict, true);
    ctx._maybeWriteThroughLocalFile = async () => {};
    assert.equal(await ctx._prepareDesktopClose(), false, 'unresolved linked conflict cannot silently close');
  } finally { globalThis.window = previous; }
});

test('recovered dirty draft plus externally modified file preserves both as a conflict', async () => {
  const ctx = editor(); ctx._localFileModifiedAt = 5;
  const previous = globalThis.window;
  globalThis.window = { mojianDesktop: {
    statFile: async () => ({ lastModified: 10 }),
    readFile: async () => ({ content: 'external edit', lastModified: 10 })
  } };
  ctx._reloadFromLocalFile = () => { throw new Error('draft would be lost'); };
  ctx._maybeWriteThroughLocalFile = () => { throw new Error('external edit would be lost'); };
  try {
    await ctx._restoreDesktopFileLink();
    assert.equal(ctx.sourceRef.current.value, 'last keystroke');
    assert.equal(ctx._localFileConflict, true);
    assert.equal(ctx.dirty, true);
  } finally { globalThis.window = previous; }
});
