import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ViewMethods } from '../src/editor/viewMethods.ts';

function createContext() {
  const attributes = new Map<string, string>();
  const title = { textContent: '' };
  const preview = {
    setAttribute(name: string, value: string) { attributes.set(name, value); },
    getAttribute(name: string) { return attributes.get(name); }
  };
  return {
    context: {
      previewRef: { current: preview },
      previewTitleRef: { current: title },
      previewFullscreen: false,
      previewOverrideMarkdown: ''
    },
    preview,
    title
  };
}

test('preview stays read-only in split, preview, and immersive layouts', () => {
  const { context, preview, title } = createContext();

  ViewMethods.prototype._syncPreviewEditable.call(context);
  assert.equal(preview.getAttribute('contenteditable'), 'false');
  assert.equal(title.textContent, '预览 · 仅阅读');

  context.previewFullscreen = true;
  ViewMethods.prototype._syncPreviewEditable.call(context);
  assert.equal(preview.getAttribute('contenteditable'), 'false');
  assert.equal(title.textContent, '预览 · 仅阅读');

  context.previewFullscreen = false;
  ViewMethods.prototype._syncPreviewEditable.call(context);
  assert.equal(preview.getAttribute('contenteditable'), 'false');
  assert.equal(title.textContent, '预览 · 仅阅读');
});

test('preview remains read-only when override content is shown', () => {
  const { context, preview } = createContext();

  ViewMethods.prototype._syncPreviewEditable.call(context);
  assert.equal(preview.getAttribute('contenteditable'), 'false');

  context.previewOverrideMarkdown = '# answer';
  ViewMethods.prototype._syncPreviewEditable.call(context);
  assert.equal(preview.getAttribute('contenteditable'), 'false');
});

function createClassList() {
  const classes = new Set<string>();
  return {
    toggle(name: string, force: boolean) { force ? classes.add(name) : classes.delete(name); },
    contains(name: string) { return classes.has(name); }
  };
}

test('view modes map to editor-only, split, and preview-only layouts', () => {
  const classList = createClassList();
  const buttons = ['editor', 'split', 'preview'].map((mode) => ({
    dataset: { mode },
    pressed: '',
    setAttribute(name: string, value: string) { if (name === 'aria-pressed') this.pressed = value; }
  }));
  const context = {
    viewMode: 'split',
    splitRef: { current: { classList } },
    viewModeSwitcherRef: { current: { querySelectorAll: () => buttons } }
  };

  ViewMethods.prototype._syncViewMode.call(context);
  assert.equal(classList.contains('editor-mode-active'), false);
  assert.equal(classList.contains('preview-mode-active'), false);
  assert.deepEqual(buttons.map((button) => button.pressed), ['false', 'true', 'false']);

  context.viewMode = 'editor';
  ViewMethods.prototype._syncViewMode.call(context);
  assert.equal(classList.contains('editor-mode-active'), true);

  context.viewMode = 'preview';
  ViewMethods.prototype._syncViewMode.call(context);
  assert.equal(classList.contains('preview-mode-active'), true);
});
