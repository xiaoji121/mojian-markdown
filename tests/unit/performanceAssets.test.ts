import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);

async function readProjectFile(path: string) {
  return readFile(new URL(path, root), 'utf8');
}

test('web entry does not declare render-blocking remote font stylesheets', async () => {
  const html = await readProjectFile('index.html');

  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test('synchronously loaded styles hide the raw editor template on first paint', async () => {
  const landingStyles = await readProjectFile('src/landing.css');

  assert.match(landingStyles, /x-dc\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('shared web styles expose the complete Canger GB2312 reading font', async () => {
  const [styles, tokens, landingStyles] = await Promise.all([
    readProjectFile('src/editor/styles.css'),
    readProjectFile('src/theme/tokens.css'),
    readProjectFile('src/landing.css')
  ]);
  const webFont = await stat(new URL('public/fonts/canger-jinkai-04/cejk-subset.woff2', root))
    .catch(() => null);

  assert.match(landingStyles, /@font-face[\s\S]*cejk-subset\.woff2/);
  assert.doesNotMatch(styles, /@font-face[\s\S]*Canger JinKai 04/);
  assert.doesNotMatch(styles, /cejk-web\.woff2/);
  assert.match(tokens, /--read:\s*'Canger JinKai 04'/);
  if (webFont) {
    assert.ok(webFont.size <= 2 * 1024 * 1024, `web font is ${Math.ceil(webFont.size / 1024)} KiB`);
  }
});
