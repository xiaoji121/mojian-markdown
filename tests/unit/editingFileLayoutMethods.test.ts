import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditingFileLayoutMethods } from '../../src/editor/editingFileLayoutMethods.ts';

function createSource(value: string, selectionStart: number, selectionEnd = selectionStart) {
  let currentValue = value;
  return {
    selectionStart,
    selectionEnd,
    scrollTop: 120,
    scrollLeft: 8,
    focusOptions: undefined as FocusOptions | undefined,
    get value() { return currentValue; },
    set value(next: string) {
      currentValue = next;
      this.selectionStart = next.length;
      this.selectionEnd = next.length;
    },
    focus(options?: FocusOptions) {
      this.focusOptions = options;
      if (this.selectionStart === currentValue.length) this.scrollTop = 999;
    }
  };
}

function createEditor(source: ReturnType<typeof createSource>) {
  const editor = new EditingFileLayoutMethods() as EditingFileLayoutMethods & Record<string, unknown>;
  editor.sourceRef = { current: source };
  editor.undoButtonRef = { current: null };
  editor.redoButtonRef = { current: null };
  editor._renderPreview = () => {};
  editor._touch = () => {};
  return editor;
}

test('inline formatting preserves source scroll while restoring focus and selection', () => {
  const source = createSource('before selected after', 7, 15);
  const editor = createEditor(source);

  editor._wrapSel('**', '**', '粗体');

  assert.equal(source.value, 'before **selected** after');
  assert.deepEqual([source.selectionStart, source.selectionEnd], [9, 17]);
  assert.equal(source.scrollTop, 120);
  assert.equal(source.scrollLeft, 8);
  assert.deepEqual(source.focusOptions, { preventScroll: true });
});

test('line formatting preserves source scroll while restoring focus and selection', () => {
  const source = createSource('first\nsecond\nthird', 7, 12);
  const editor = createEditor(source);

  editor._linePrefix('> ');

  assert.equal(source.value, 'first\n> second\nthird');
  assert.deepEqual([source.selectionStart, source.selectionEnd], [6, 14]);
  assert.equal(source.scrollTop, 120);
  assert.equal(source.scrollLeft, 8);
  assert.deepEqual(source.focusOptions, { preventScroll: true });
});

test('undo and redo restore content and selection for toolbar formatting', () => {
  const source = createSource('selected', 0, 8);
  const editor = createEditor(source);
  editor._resetEditingHistory();

  editor._wrapSel('**', '**', '粗体');
  assert.equal(source.value, '**selected**');

  editor.undoEdit();
  assert.equal(source.value, 'selected');
  assert.deepEqual([source.selectionStart, source.selectionEnd], [0, 8]);

  editor.redoEdit();
  assert.equal(source.value, '**selected**');
  assert.deepEqual([source.selectionStart, source.selectionEnd], [2, 10]);
});

test('a new edit after undo clears the redo history', () => {
  const source = createSource('one', 3);
  const editor = createEditor(source);
  editor._resetEditingHistory();
  source.value = 'one two';
  editor._recordEditingHistory('insertText');
  editor.undoEdit();

  source.value = 'one three';
  editor._recordEditingHistory('insertText');
  editor.redoEdit();

  assert.equal(source.value, 'one three');
});

test('undo restores the selection made immediately before formatting', () => {
  const source = createSource('alpha beta', 10);
  const editor = createEditor(source);
  editor._resetEditingHistory();
  source.selectionStart = 6;
  source.selectionEnd = 10;

  editor._wrapSel('**', '**', '粗体');
  editor.undoEdit();

  assert.equal(source.value, 'alpha beta');
  assert.deepEqual([source.selectionStart, source.selectionEnd], [6, 10]);
});

test('source shortcuts invoke undo and redo', () => {
  const source = createSource('text', 4);
  const editor = createEditor(source);
  let undoCount = 0;
  let redoCount = 0;
  editor.undoEdit = () => { undoCount += 1; };
  editor.redoEdit = () => { redoCount += 1; };
  const event = (key: string, shiftKey = false) => ({
    key,
    shiftKey,
    metaKey: true,
    ctrlKey: false,
    preventDefault() {}
  });

  editor._sourceKeydown(event('z'));
  editor._sourceKeydown(event('z', true));
  editor._sourceKeydown(event('y'));

  assert.equal(undoCount, 1);
  assert.equal(redoCount, 2);
});

test('另存为总是弹出保存对话框并接上新文件句柄（桌面端）', async () => {
  const dialogCalls: unknown[] = [];
  (globalThis as { window?: unknown }).window = {
    mojianDesktop: {
      saveMarkdownFileAs: async (name: string, content: string) => {
        dialogCalls.push([name, content]);
        return { path: '/tmp/新文件.md', name: '新文件.md', lastModified: 1 };
      }
    }
  };
  try {
    const source = createSource('# 内容', 0);
    const editor = createEditor(source);
    editor.fileName = '旧文件.md';
    // 已有关联句柄也不允许原地写入：另存为必须走对话框
    editor.fileHandle = { createWritable: () => { throw new Error('另存为不应原地写入'); } };
    const attached: Array<{ desktopPath?: string }> = [];
    editor._attachLocalFile = async (handle: { desktopPath?: string }) => { attached.push(handle); };
    editor._setFileName = (name: string) => { editor.fileName = name; };
    editor._setDirty = () => {};
    editor._autosave = () => {};
    editor._setStatus = (msg: string) => { editor.statusMsg = msg; };

    await (editor as { onSaveAs: () => Promise<void> }).onSaveAs();

    assert.deepEqual(dialogCalls, [['旧文件.md', '# 内容']]);
    assert.equal(editor.fileName, '新文件.md');
    assert.equal(attached.length, 1);
    assert.equal(attached[0].desktopPath, '/tmp/新文件.md');
    assert.ok(String(editor.statusMsg).includes('新文件.md'));
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('已关联本地文件时保存原地写入，不弹对话框', async () => {
  let dialogCount = 0;
  (globalThis as { window?: unknown }).window = {
    mojianDesktop: { saveMarkdownFileAs: async () => { dialogCount += 1; return null; } }
  };
  try {
    const source = createSource('# 正文', 0);
    const editor = createEditor(source);
    editor.fileName = '笔记.md';
    const written: string[] = [];
    editor.fileHandle = {
      createWritable: async () => ({
        write: async (content: string) => { written.push(content); },
        close: async () => {}
      })
    };
    editor._updateLocalFileBaseline = async () => {};
    editor._localFileConflict = true;
    editor._setDirty = () => {};
    editor._autosave = () => {};
    editor._setStatus = (msg: string) => { editor.statusMsg = msg; };

    await (editor as { onSave: () => Promise<void> }).onSave();

    assert.deepEqual(written, ['# 正文']);
    assert.equal(dialogCount, 0);
    assert.equal(editor._localFileConflict, false);
    assert.ok(String(editor.statusMsg).includes('笔记.md'));
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('未关联文件时保存委托给另存为', async () => {
  const source = createSource('# 正文', 0);
  const editor = createEditor(source);
  let saveAsCount = 0;
  editor.onSaveAs = async () => { saveAsCount += 1; };

  await (editor as { onSave: () => Promise<void> }).onSave();

  assert.equal(saveAsCount, 1);
});

test('文件菜单开合同步 is-open 与 aria-expanded', () => {
  const docListeners = new Map<string, unknown[]>();
  (globalThis as { document?: unknown }).document = {
    addEventListener(type: string, listener: unknown) {
      docListeners.set(type, [...(docListeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: unknown) {
      docListeners.set(type, (docListeners.get(type) ?? []).filter((item) => item !== listener));
    }
  };
  try {
    const editor = createEditor(createSource('', 0));
    const attrs = new Map<string, string>();
    const classes = new Set<string>();
    editor.fileMenuRef = {
      current: {
        classList: {
          toggle(name: string, force: boolean) { force ? classes.add(name) : classes.delete(name); },
          contains(name: string) { return classes.has(name); }
        },
        contains() { return false; }
      }
    };
    editor.fileMenuButtonRef = {
      current: {
        setAttribute(name: string, value: string) { attrs.set(name, value); },
        contains() { return false; }
      }
    };

    (editor as { toggleFileMenu: (force?: boolean) => void }).toggleFileMenu();
    assert.equal(classes.has('is-open'), true);
    assert.equal(attrs.get('aria-expanded'), 'true');
    assert.equal((docListeners.get('click') ?? []).length, 1);

    (editor as { toggleFileMenu: (force?: boolean) => void }).toggleFileMenu();
    assert.equal(classes.has('is-open'), false);
    assert.equal(attrs.get('aria-expanded'), 'false');
    assert.equal((docListeners.get('click') ?? []).length, 0);
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});

test('桌面端菜单 save-as 动作触发另存为', () => {
  let menuCallback: ((action: string) => void) | null = null;
  (globalThis as { window?: unknown }).window = {
    mojianDesktop: {
      onMenu: (cb: (action: string) => void) => { menuCallback = cb; },
      onOpenPath: () => {},
      consumePendingOpen: async () => null
    }
  };
  (globalThis as { document?: unknown }).document = {
    body: { classList: { add: () => {} } }
  };
  try {
    const editor = createEditor(createSource('', 0));
    const actions: string[] = [];
    editor.onNew = () => { actions.push('new'); };
    editor.onOpen = () => { actions.push('open'); };
    editor.onSave = () => { actions.push('save'); };
    editor.onSaveAs = () => { actions.push('save-as'); };
    editor._initDesktop();

    menuCallback!('save');
    menuCallback!('save-as');

    assert.deepEqual(actions, ['save', 'save-as']);
  } finally {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
  }
});

test('桌面端 _initDesktop 给 body 打上 is-desktop-app 标记（CSS 据此隐藏网页版专属 UI）', async () => {
  (globalThis as { window?: unknown }).window = {
    mojianDesktop: {
      onMenu: () => {},
      onOpenPath: () => {},
      consumePendingOpen: async () => null
    }
  };
  const classes = new Set<string>();
  (globalThis as { document?: unknown }).document = {
    body: { classList: { add: (name: string) => classes.add(name) } }
  };
  try {
    const editor = new EditingFileLayoutMethods() as EditingFileLayoutMethods & Record<string, any>;
    editor._initDesktop();
    assert.ok(classes.has('is-desktop-app'));
  } finally {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
  }
});
