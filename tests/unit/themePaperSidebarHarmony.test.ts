import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('source and preview toolbars follow paper tokens, not chrome bg', () => {
  const css = readFileSync(resolve('src/editor/workspaceVisual.css'), 'utf8');
  assert.match(css, /\.source-pane > \.pane-toolbar/);
  assert.match(css, /\.preview-pane > \.reading-toolbar/);
  // Both share a paper-bg block
  assert.match(
    css,
    /\.source-pane > \.pane-toolbar,\s*\.preview-pane > \.reading-toolbar\s*\{[\s\S]*?background:\s*var\(--paper-bg\)/
  );
  assert.match(css, /color:\s*var\(--paper-text-3\)/);
  // Source toolbar icons must not be washed out
  assert.match(css, /\.source-toolbar-leading, \.source-toolbar-actions \{ opacity: 1; \}/);
});

test('pane title locale key is lightweight 原文', () => {
  const html = readFileSync(resolve('index.html'), 'utf8');
  const locale = readFileSync(resolve('src/editor/locales/shell.ts'), 'utf8');
  assert.match(html, /data-i18n="原文">原文</);
  assert.doesNotMatch(html, /data-i18n="Markdown 原文"/);
  assert.match(locale, /"原文":\s*\["原文",\s*"Source",\s*"原文"\]/);
  // View-mode title unchanged
  assert.match(html, /data-i18n-title="仅显示 Markdown 原文"/);
});
