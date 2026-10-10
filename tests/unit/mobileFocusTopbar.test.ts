import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const visual = () => readFileSync(resolve('src/editor/workspaceVisual.css'), 'utf8');
const html = () => readFileSync(resolve('index.html'), 'utf8');

test('mobile focus topbar uses max-width 720px breakpoint', () => {
  const css = visual();
  assert.match(css, /手机专注顶栏/);
  assert.match(css, /@media \(max-width:\s*720px\)/);
});

test('narrow focus stacks exit above reading toolbar with safe-area and 44px touch', () => {
  const css = visual();
  const mobile = css.slice(css.indexOf('手机专注顶栏'));
  assert.match(mobile, /--focus-exit-height:\s*44px/);
  assert.match(mobile, /--focus-tools-gap:\s*8px/);
  assert.match(mobile, /safe-area-inset-top/);
  assert.match(mobile, /\.focus-exit-esc-hint\s*\{[\s\S]*?display:\s*none/);
  assert.match(mobile, /--focus-tools-top/);
  assert.match(
    mobile,
    /preview-pane-fullscreen > \.reading-toolbar[\s\S]*?top:\s*var\(--focus-tools-top\)/
  );
});

test('narrow focus hides view-mode switcher', () => {
  const mobile = visual().slice(visual().indexOf('手机专注顶栏'));
  assert.match(
    mobile,
    /:has\(\.preview-pane-fullscreen\) \.view-mode-switcher[\s\S]*?display:\s*none/
  );
});

test('focus exit Esc hint is marked and aria-label has no Esc', () => {
  const h = html();
  assert.match(h, /class="focus-exit-esc-hint"/);
  assert.match(h, /focus-exit-sticky"[^>]*aria-label="退出专注"/);
  assert.doesNotMatch(h, /focus-exit-sticky"[^>]*aria-label="退出专注 · Esc"/);
});
