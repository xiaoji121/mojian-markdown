import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

test('bundled Source Serif is pinned, unmodified WOFF2 with TrueType outlines and exact OFL', () => {
  const provenance = JSON.parse(read('public/fonts/source-serif-4/provenance.json').toString());
  assert.equal(provenance.version, '4.005');
  assert.match(provenance.archive, /^https:\/\/github.com\/adobe-fonts\/source-serif\/releases\/download\/4.005R\//);
  assert.equal(provenance.files.length, 2);
  for (const file of provenance.files) {
    const bytes = read('src/fonts/source-serif-4/' + file.file);
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha(bytes), file.sha256);
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
    // WOFF2 sfnt flavor: 0x00010000 = TrueType, not OTTO (CFF/CFF2).
    assert.equal(bytes.readUInt32BE(4), 0x00010000);
  }
  const license = read('public/fonts/source-serif-4/LICENSE.md');
  assert.equal(sha(license), provenance.licenseSha256);
  assert.match(license.toString(), /Copyright 2014 - 2023 Adobe/);
  assert.match(license.toString(), /SIL OPEN FONT LICENSE Version 1.1/);
});
