import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEditorStateStore, isTrustedEditorSender } from '../../desktop/editorState.js';
import { createCloseCoordinator } from '../../desktop/closeCoordinator.js';

function withStore(run: (store: any, path: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mojian-state-'));
  try { run(createEditorStateStore(root), join(root, 'editor-state.json')); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
const state = { content: '# draft', fileName: 'test.md', fontSize: 16, theme: 'dark', comments: [] };

test('durable editor state survives a fresh store and excludes credentials, including nested fields', () => {
  withStore((store, path) => {
    assert.deepEqual(store.load(), { ok: true, state: null });
    assert.equal(store.save({ ...state, apiKey: 'secret', comments: [{ id: '1', quote: 'draft', occ: 0,
      type: 'idea', note: 'note', ts: 1, apiKey: 'secret' }] }).ok, true);
    const stored = createEditorStateStore(join(path, '..')).load();
    assert.equal(stored.state.content, '# draft');
    assert.equal(readFileSync(path, 'utf8').includes('secret'), false);
    if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
  });
});

test('corrupt or incompatible state is retained and cannot be silently overwritten', () => {
  withStore((store, path) => {
    writeFileSync(path, '{broken');
    assert.equal(store.load().ok, false);
    assert.equal(store.save(state).ok, false);
    assert.equal(readFileSync(path, 'utf8'), '{broken');
  });
});

test('invalid state saves fail without replacing last durable draft', () => {
  withStore((store, path) => {
    assert.equal(store.save(state).ok, true);
    assert.equal(store.save({ ...state, content: 13 }).ok, false);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).state.content, '# draft');
  });
});

test('state IPC accepts only editor main frame and exact loopback origin', () => {
  const frame = { url: 'http://127.0.0.1:4321/#editor' };
  const contents = { mainFrame: frame };
  const window = { webContents: contents };
  assert.equal(isTrustedEditorSender({ sender: contents, senderFrame: frame }, window, 'http://127.0.0.1:4321'), true);
  assert.equal(isTrustedEditorSender({ sender: contents, senderFrame: { ...frame } }, window, 'http://127.0.0.1:4321'), false);
  frame.url = 'http://127.0.0.1:43210/#editor';
  assert.equal(isTrustedEditorSender({ sender: contents, senderFrame: frame }, window, 'http://127.0.0.1:4321'), false);
});

test('close waits for durable draft and pending writes; rejects stale response', async () => {
  let token = ''; let closed = 0; let release: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const coordinator = createCloseCoordinator({ prepare: (id: string) => { token = id; },
    waitForWrites: () => pending, close: () => { closed++; }, confirmLoss: async () => false });
  coordinator.request();
  await coordinator.complete('stale', true);
  assert.equal(closed, 0);
  const result = coordinator.complete(token, true);
  await Promise.resolve();
  assert.equal(closed, 0);
  release!(); await result;
  assert.equal(closed, 1);
  coordinator.dispose();
});

test('failed flush and timeout stay open unless explicit loss approval', async () => {
  let token = ''; let closed = 0; let prompts = 0; let timeout: () => void;
  const coordinator = createCloseCoordinator({ prepare: (id: string) => { token = id; },
    waitForWrites: async () => {}, close: () => { closed++; },
    confirmLoss: async () => { prompts++; return false; },
    schedule: (cb: () => void) => { timeout = cb; return 1; }, cancel: () => {} });
  coordinator.request(); await coordinator.complete(token, false);
  assert.equal(prompts, 1); assert.equal(closed, 0);
  coordinator.request(); timeout!(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(prompts, 2); assert.equal(closed, 0);
  coordinator.dispose();
});

test('atomic rename failure preserves old draft and reports failure', async () => {
  const fs = await import('node:fs');
  withStore((store, path) => {
    assert.equal(store.save(state).ok, true);
    const failingStore = createEditorStateStore(join(path, '..'), { ...fs,
      renameSync: () => { throw new Error('disk failure'); } });
    assert.equal(failingStore.save({ ...state, content: '# newer' }).ok, false);
    assert.equal(store.load().state.content, '# draft');
    assert.deepEqual(fs.readdirSync(join(path, '..')), ['editor-state.json']);
  });
});

test('read I/O failure blocks writes without losing the record', async () => {
  const fs = await import('node:fs');
  withStore((store, path) => {
    assert.equal(store.save(state).ok, true);
    const failingStore = createEditorStateStore(join(path, '..'), { ...fs,
      readFileSync: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } });
    assert.equal(failingStore.load().ok, false);
    assert.equal(failingStore.save(state).ok, false);
    assert.equal(store.load().state.content, '# draft');
  });
});

test('late flush after timeout cannot bypass Stay choice', async () => {
  let token = ''; let closed = 0; let timeout: () => void;
  let release: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const coordinator = createCloseCoordinator({ prepare: (id: string) => { token = id; },
    waitForWrites: () => pending, close: () => { closed++; }, confirmLoss: async () => false,
    schedule: (cb: () => void) => { timeout = cb; return 1; }, cancel: () => {} });
  coordinator.request(); const result = coordinator.complete(token, true);
  timeout!(); await new Promise(resolve => setImmediate(resolve));
  release!(); await result;
  assert.equal(closed, 0);
  coordinator.dispose();
});

test('explicit loss approval allows closing after failed flush', async () => {
  let token = ''; let closed = 0;
  const coordinator = createCloseCoordinator({ prepare: (id: string) => { token = id; },
    waitForWrites: async () => {}, close: () => { closed++; }, confirmLoss: async () => true });
  coordinator.request(); await coordinator.complete(token, false);
  assert.equal(closed, 1); coordinator.dispose();
});

test('preload returns synchronous results and reports rejected close callbacks as failure', async () => {
  const { runInNewContext } = await import('node:vm');
  let api: any; const listeners = new Map(); const sent: any[] = [];
  const response = { ok: true, state };
  const electron = {
    contextBridge: { exposeInMainWorld: (_name: string, value: any) => { api = value; } },
    ipcRenderer: { sendSync: () => response, on: (name: string, fn: any) => listeners.set(name, fn),
      removeListener: (name: string) => listeners.delete(name), send: (...args: any[]) => sent.push(args) }
  };
  runInNewContext(readFileSync(new URL('../../desktop/preload.cjs', import.meta.url), 'utf8'), {
    require: () => electron
  });
  assert.equal(api.loadEditorState(), response); assert.equal(api.saveEditorState(state), response);
  const remove = api.onBeforeClose(async () => { throw new Error('failed'); });
  await listeners.get('desktop:prepare-close')({}, 'token');
  assert.deepEqual(sent, [['desktop:close-ready', 'token', false]]);
  remove(); assert.equal(listeners.size, 0);
});

test('temporary file permission error reports failure and leaves old draft intact', async () => {
  const fs = await import('node:fs');
  withStore((store, path) => {
    assert.equal(store.save(state).ok, true);
    const failingStore = createEditorStateStore(join(path, '..'), { ...fs,
      openSync: () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); } });
    assert.equal(failingStore.save({ ...state, content: '# lost' }).ok, false);
    assert.equal(store.load().state.content, '# draft');
  });
});

test('cancelled close tokens cannot complete a later close attempt', async () => {
  let token = ''; let closed = 0;
  const coordinator = createCloseCoordinator({ prepare: (id: string) => { token = id; },
    waitForWrites: async () => {}, close: () => { closed++; }, confirmLoss: async () => false });
  coordinator.request(); const previous = token;
  await coordinator.complete(previous, false);
  coordinator.request(); assert.notEqual(token, previous);
  await coordinator.complete(previous, true); assert.equal(closed, 0);
  await coordinator.complete(token, true); assert.equal(closed, 1);
  coordinator.dispose();
});

test('annotation replies and answer document association survive persistence', () => {
  withStore((store) => {
    const comment = { id: 'a', quote: 'text', occ: 0, type: 'idea', note: 'note', ts: 1,
      reply: 'reply text', replyAt: 2, answerRequestId: 'answer-1' };
    assert.equal(store.save({ ...state, comments: [comment] }).ok, true);
    assert.deepEqual(store.load().state.comments, [comment]);
  });
});

test('cancelling failed close invokes input restoration exactly once', async () => {
  let token = ''; let restored = 0;
  const coordinator = createCloseCoordinator({ prepare: (id: string) => { token = id; },
    waitForWrites: async () => {}, close: () => {}, confirmLoss: async () => false,
    onCancel: () => { restored++; } });
  coordinator.request(); await coordinator.complete(token, false);
  await coordinator.complete(token, false);
  assert.equal(restored, 1); coordinator.dispose();
});

test('preload freezes document during close preparation and restores it on cancellation', async () => {
  const { runInNewContext } = await import('node:vm');
  let api: any; const listeners = new Map();
  const document = { documentElement: { inert: false } };
  const electron = {
    contextBridge: { exposeInMainWorld: (_name: string, value: any) => { api = value; } },
    ipcRenderer: { on: (name: string, fn: any) => listeners.set(name, fn),
      removeListener: (name: string) => listeners.delete(name), send: () => {} }
  };
  runInNewContext(readFileSync(new URL('../../desktop/preload.cjs', import.meta.url), 'utf8'), {
    require: () => electron, document
  });
  const remove = api.onBeforeClose(async () => {
    assert.equal(document.documentElement.inert, true); return false;
  });
  await listeners.get('desktop:prepare-close')({}, 'token');
  assert.equal(document.documentElement.inert, true);
  listeners.get('desktop:close-cancelled')({}, 'token');
  assert.equal(document.documentElement.inert, false);
  remove();
});

test('desktop settings preserve pinned IDs and panel widths without arbitrary settings', () => {
  withStore((store) => {
    const ui = { pinnedDocumentIds: ['first', 'second'], aiPanelWidth: 350,
      commentsPanelWidth: 280, documentSidebarWidth: 220 };
    assert.equal(store.save({ ...state, ...ui, settings: { apiKey: 'secret' } }).ok, true);
    assert.deepEqual(store.load().state, { ...state, ...ui });
  });
});

test('desktop settings reject non-string pinned IDs and nonfinite panel widths', () => {
  withStore((store) => {
    assert.equal(store.save(state).ok, true);
    assert.equal(store.save({ ...state, pinnedDocumentIds: ['first', 12] }).ok, false);
    assert.equal(store.save({ ...state, pinnedDocumentIds: 'first' }).ok, false);
    assert.equal(store.save({ ...state, aiPanelWidth: Infinity }).ok, false);
    assert.equal(store.save({ ...state, commentsPanelWidth: NaN }).ok, false);
    assert.equal(store.save({ ...state, documentSidebarWidth: '220' }).ok, false);
    assert.deepEqual(store.load().state, state);
  });
});
