import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITOR_STORAGE_KEY, loadEditorState, saveEditorState } from '../../src/editor/storage.ts';
import { installLocalStorageStub } from '../helpers/dom.ts';

test('saveEditorState round-trips through loadEditorState', () => {
  const restore = installLocalStorageStub();
  try {
    const saved = { content: '# 标题', fileName: '笔记.md', fontSize: 18, theme: 'dark' as const, comments: [] };
    saveEditorState(saved);
    assert.deepEqual(loadEditorState(), saved);
  } finally {
    restore();
  }
});

test('loadEditorState returns null when nothing is saved', () => {
  const restore = installLocalStorageStub();
  try {
    assert.equal(loadEditorState(), null);
  } finally {
    restore();
  }
});

test('loadEditorState tolerates corrupted or non-object payloads', () => {
  for (const raw of ['not-json{', '"a string"', 'null', '123']) {
    const restore = installLocalStorageStub({ [EDITOR_STORAGE_KEY]: raw });
    try {
      assert.equal(loadEditorState(), null, `payload: ${raw}`);
    } finally {
      restore();
    }
  }
});

test('desktop storage survives an origin change and never falls back after a failed desktop read', () => {
  const restore = installLocalStorageStub({ [EDITOR_STORAGE_KEY]: JSON.stringify({ content: 'stale browser' }) });
  const previous = globalThis.window;
  const state = { content: 'desktop draft', fileName: '未命名.md', fontSize: 20, theme: 'light', comments: [] };
  let durable = state;
  globalThis.window = { mojianDesktop: {
    loadEditorState: () => ({ ok: true, state: durable }),
    saveEditorState: (next) => { durable = next; return { ok: true }; }
  } };
  try {
    assert.deepEqual(loadEditorState(), state);
    assert.equal(saveEditorState({ ...state, content: 'latest' }), true);
    localStorage.clear();
    assert.equal(loadEditorState()?.content, 'latest');
    globalThis.window.mojianDesktop.loadEditorState = () => ({ ok: false, error: 'corrupt' });
    assert.equal(loadEditorState(), null);
    globalThis.window.mojianDesktop.saveEditorState = () => ({ ok: false, error: 'disk full' });
    assert.equal(saveEditorState(state), false);
  } finally { globalThis.window = previous; restore(); }
});
