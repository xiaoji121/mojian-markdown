import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditingFileLayoutMethods } from '../src/editor/editingFileLayoutMethods.ts';

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
