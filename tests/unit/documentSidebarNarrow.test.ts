import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('document sidebar stacks file actions when narrow (CSS)', () => {
  const css = readFileSync(resolve('src/editor/documentSidebar.css'), 'utf8');
  assert.match(css, /container-name:\s*doc-sidebar/);
  assert.match(css, /@container doc-sidebar \(max-width:\s*250px\)/);
  assert.match(css, /flex-direction:\s*column/);
});

test('document sidebar min drag width is at least 200', () => {
  const src = readFileSync(resolve('src/editor/editingFileLayoutMethods.ts'), 'utf8');
  assert.match(src, /Math\.max\(200,/);
});
