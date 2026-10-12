import {test} from 'node:test';
import assert from 'node:assert/strict';
import {desktopSourceLines} from '../../src/editor/desktopSourceMethods.ts';

test('source mirror escapes untrusted HTML while keeping line numbers and trailing blank lines',()=>{
  const html=desktopSourceLines('<img src=x onerror="alert(1)">\n\n');
  assert.equal((html.match(/class="pc-source-line"/g)||[]).length,3);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(!html.includes('<img'));
});

test('a multiline match paints both logical lines without losing text or its current identity',()=>{
  const html=desktopSourceLines('abc\ndef',[{start:1,end:6}],0);
  assert.equal((html.match(/source-mark is-current/g)||[]).length,2);
  assert.ok(html.includes('>bc</mark>')); assert.ok(html.includes('>de</mark>'));
  assert.ok(html.endsWith('f</span>'));
});
