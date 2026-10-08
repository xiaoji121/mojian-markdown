import { readFile } from 'node:fs/promises';
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

test('shared reading styles prefer local Canger without downloading a font', async () => {
  const [tokens, landingStyles] = await Promise.all([
    readProjectFile('src/theme/tokens.css'),
    readProjectFile('src/landing.css')
  ]);
  assert.match(tokens, /@font-face[\s\S]*local\("TsangerJinKai04-W04"\)/);
  assert.match(tokens, /--read:\s*'Mojian Local JinKai 04'/);
  assert.doesNotMatch(landingStyles, /cejk-subset\.woff2/);
});
