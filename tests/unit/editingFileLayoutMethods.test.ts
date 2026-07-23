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
