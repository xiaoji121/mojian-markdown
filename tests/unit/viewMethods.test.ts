import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ViewMethods } from '../../src/editor/viewMethods.ts';
import { createClassList, createRef, createStubElement } from '../helpers/dom.ts';

function createContext() {
  const title = createStubElement();
  const preview = createStubElement();
  return {
    context: {
      previewRef: createRef(preview),
      previewTitleRef: createRef(title),
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

test('view modes map to editor-only, split, and preview-only layouts', () => {
  const classList = createClassList();
  const buttons = ['editor', 'split', 'preview'].map((mode) => ({
    dataset: { mode },
    pressed: '',
    setAttribute(name: string, value: string) { if (name === 'aria-pressed') this.pressed = value; }
  }));
  const context = {
    viewMode: 'split',
    splitRef: createRef({ classList }),
    viewModeSwitcherRef: createRef({ querySelectorAll: () => buttons })
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

test('桌面端把预览中的相对路径图片替换为 data URL，绝对与 data 路径不动', async () => {
  const calls: string[] = [];
  (globalThis as { window?: unknown }).window = {
    mojianDesktop: {
      readAsset: async (_doc: string, src: string) => {
        calls.push(src);
        return { dataUrl: 'data:image/png;base64,AAA' };
      }
    }
  };
  try {
    const makeImg = (src: string) => ({
      src,
      getAttribute: () => src
    });
    const relative = makeImg('../assets/flow.png');
    const absolute = makeImg('https://example.com/a.png');
    const inline = makeImg('data:image/png;base64,BBB');
    const root = { querySelectorAll: () => [relative, absolute, inline] };
    const context = {
      localFilePath: '/Users/me/drafts/note.md',
      _localImageCache: new Map<string, string>(),
      _hydrateLocalImages: ViewMethods.prototype._hydrateLocalImages
    };

    context._hydrateLocalImages(root);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(relative.src, 'data:image/png;base64,AAA');
    assert.equal(absolute.src, 'https://example.com/a.png');
    assert.equal(inline.src, 'data:image/png;base64,BBB');
    assert.deepEqual(calls, ['../assets/flow.png']);

    // 再次渲染命中缓存，不重复请求
    const again = makeImg('../assets/flow.png');
    context._hydrateLocalImages({ querySelectorAll: () => [again] });
    assert.equal(again.src, 'data:image/png;base64,AAA');
    assert.deepEqual(calls, ['../assets/flow.png']);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('网页版或未关联本地文件时不改写图片', () => {
  const img = { src: './a.png', getAttribute: () => './a.png' };
  const context = {
    localFilePath: null,
    _localImageCache: new Map<string, string>(),
    _hydrateLocalImages: ViewMethods.prototype._hydrateLocalImages
  };

  context._hydrateLocalImages({ querySelectorAll: () => [img] });

  assert.equal(img.src, './a.png');
});
