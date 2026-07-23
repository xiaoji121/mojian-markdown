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
