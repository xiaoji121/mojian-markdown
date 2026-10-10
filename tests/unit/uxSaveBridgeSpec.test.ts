import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutlineMethods } from '../../src/editor/outlineMethods.ts';
import { ViewMethods } from '../../src/editor/viewMethods.ts';
import { WorkspaceMenuMethods } from '../../src/editor/workspaceMenuMethods.ts';
import { setLocale, t } from '../../src/editor/i18n.ts';

test('outline plain text strips comment badges (B4)', () => {
  const editor = Object.assign(new OutlineMethods(), {});
  const heading = {
    cloneNode() {
      const el = {
        textContent: 'Title1',
        querySelectorAll(sel: string) {
          assert.ok(sel.includes('data-comment-badge'));
          return [{ remove() { el.textContent = 'Title'; } }];
        }
      };
      return el;
    },
    textContent: 'Title1'
  };
  assert.equal(editor._outlinePlainText(heading), 'Title');
});

test('persistent status key exists and is short', () => {
  setLocale('zh-CN');
  const short = t('草稿已自动保存在此浏览器');
  assert.equal(short, '草稿已自动保存在此浏览器');
  assert.ok(!short.includes('另存为'));
});

test('dual-slot status: toast does not clear persist ref', () => {
  const editor = Object.assign(new ViewMethods(), {
    persistStatusRef: { current: { textContent: '' } },
    saveStatusRef: { current: { textContent: '', hidden: false } },
    fileHandle: null,
    localFilePath: null,
    _localFileConflict: false,
    _syncWorkspaceChrome() {}
  });
  editor._syncPersistentStatus();
  assert.equal(editor.persistStatusRef.current.textContent, '草稿已自动保存在此浏览器');
  editor._setStatus('✓ 想法已写');
  assert.equal(editor.persistStatusRef.current.textContent, '草稿已自动保存在此浏览器');
  assert.equal(editor.saveStatusRef.current.textContent, '✓ 想法已写');
});

test('static Ctrl+S routing prefers backup when no writable file', () => {
  const calls: string[] = [];
  const editor = Object.assign(new WorkspaceMenuMethods(), {
    fileHandle: null,
    agentBridgeEnabled: false,
    onSave() { calls.push('save'); },
    onSaveAs() { calls.push('saveAs'); },
    downloadFullBackup() { calls.push('backup'); return Promise.resolve(); },
    _setStatus() {}
  });
  // pretend browser without FS access
  const prev = globalThis.window;
  // @ts-ignore
  globalThis.window = { showSaveFilePicker: undefined, mojianDesktop: undefined };
  try {
    assert.equal(editor._canWriteOpenFile(), false);
    assert.equal(editor._canWriteToDisk(), false);
    editor._menuSaveOrBackup();
    assert.deepEqual(calls, ['backup']);
  } finally {
    // @ts-ignore
    globalThis.window = prev;
  }
});


test('static selection AI entries use hidden attribute (not only CSS)', async () => {
  const { WorkspaceNavigationMethods } = await import('../../src/editor/workspaceNavigationMethods.ts');
  const aiBtn = { hidden: false };
  const translateBtn = { hidden: false };
  const tabAi = { hidden: false };
  const prev = globalThis.document;
  // @ts-ignore
  globalThis.document = {
    querySelectorAll(sel: string) {
      if (sel.includes('selection-toolbar')) return [aiBtn, translateBtn];
      if (sel.includes('assistance-tabs')) return [tabAi];
      return [];
    }
  };
  try {
    const editor = Object.assign(new WorkspaceNavigationMethods(), {
      agentBridgeEnabled: false,
      panelOpen: false,
      aiPanelOpen: false,
      outlinePanelOpen: false,
      comments: [],
      splitRef: { current: null },
      fileHandle: null,
      localFilePath: null,
      dirty: false,
      _localFileConflict: false
    });
    editor._syncWorkspaceChrome();
    assert.equal(aiBtn.hidden, true);
    assert.equal(translateBtn.hidden, true);
    assert.equal(tabAi.hidden, true);
    editor.agentBridgeEnabled = true;
    editor._syncWorkspaceChrome();
    assert.equal(aiBtn.hidden, false);
    assert.equal(translateBtn.hidden, false);
    assert.equal(tabAi.hidden, false);
  } finally {
    // @ts-ignore
    globalThis.document = prev;
  }
});


test('toggleAIEntry opens settings when Bridge is off', async () => {
  const { AIMethods } = await import('../../src/editor/aiMethods.ts');
  const calls: string[] = [];
  const editor = Object.assign(new AIMethods(), {
    agentBridgeEnabled: false,
    openWorkspaceSettings(page: string) { calls.push('settings:' + page); },
    _setStatus(msg: string) { calls.push('status:' + msg); },
    _openAIPanel() { calls.push('panel'); }
  });
  editor.toggleAIEntry();
  assert.deepEqual(calls[0], 'settings:ai');
  assert.ok(calls.some((c) => c.startsWith('status:')));
  editor.agentBridgeEnabled = true;
  calls.length = 0;
  editor.toggleAIEntry();
  assert.deepEqual(calls, ['panel']);
});
