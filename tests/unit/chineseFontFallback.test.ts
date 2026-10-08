import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('Latin font keeps the existing local JinKai stack for uncovered Chinese glyphs', () => {
  const css = read('src/theme/tokens.css');
  assert.match(css, /--read-source:\s*'Source Serif 4',\s*var\(--read-local\)/);
  assert.match(css, /--read-local:\s*'Mojian Local JinKai 04'/);
});

test('Chinese landing typography is scoped to its content language, with Japanese fallback distinct', () => {
  const css = read('src/landing.css');
  assert.match(css, /#landing-page\[lang='zh-CN'\],\s*#landing-page\[lang='zh-TW'\]\s*\{[^}]*--landing-serif:\s*var\(--read-local\)/);
  assert.match(css, /#landing-page\[lang='ja'\]\s*\{[^}]*--landing-serif:\s*var\(--read-source-ja\)/);
});

test('known Japanese documents override only the Source Serif fallback, never explicit JinKai or UI locale', () => {
  const css = read('src/theme/tokens.css');
  assert.match(css, /\[data-reading-font='source-serif-4'\]\s+\.md-preview\[lang='ja'\]/);
  assert.match(css, /--read-source-ja:[^;]*'Yu Mincho'[^;]*'Noto Serif CJK JP'/);
});
