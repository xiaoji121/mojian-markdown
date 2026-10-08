import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createReadingFontStore, validateFontBytes, MAX_READING_FONT_BYTES } from '../../desktop/readingFontStore.js';

const recordName = 'reading-font.json';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function font(format = 'ttf') {
  if (format === 'woff') {
    const bytes = Buffer.alloc(68);
    bytes.write('wOFF'); bytes.writeUInt32BE(0x00010000, 4); bytes.writeUInt32BE(bytes.length, 8);
    bytes.writeUInt16BE(1, 12); bytes.writeUInt32BE(32, 16);
    bytes.write('cmap', 44); bytes.writeUInt32BE(64, 48); bytes.writeUInt32BE(4, 52); bytes.writeUInt32BE(4, 56);
    bytes.writeUInt32BE(0x12345678, 64);
    return bytes;
  }
  if (format === 'woff2') {
    const bytes = Buffer.alloc(54);
    bytes.write('wOF2'); bytes.writeUInt32BE(0x00010000, 4); bytes.writeUInt32BE(bytes.length, 8);
    bytes.writeUInt16BE(1, 12); bytes.writeUInt32BE(32, 16); bytes.writeUInt32BE(4, 20);
    bytes[48] = 0; bytes[49] = 4; bytes.writeUInt32BE(0x12345678, 50);
    return bytes;
  }
  const bytes = Buffer.alloc(32);
  if (format === 'otf') bytes.write('OTTO'); else bytes.writeUInt32BE(0x00010000);
  bytes.writeUInt16BE(1, 4); bytes.writeUInt16BE(16, 6);
  bytes.write('cmap', 12); bytes.writeUInt32BE(28, 20); bytes.writeUInt32BE(4, 24);
  bytes.writeUInt32BE(0x12345678, 28);
  return bytes;
}
async function withStore(run: (store: any, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), 'mojian-reading-font-'));
  try { await run(createReadingFontStore(root), root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

for (const format of ['woff', 'woff2', 'ttf', 'otf']) {
  test(`${format} header validation and imported bytes survive a fresh store exactly`, async () => {
    await withStore(async (store, root) => {
      const bytes = font(format);
      assert.deepEqual(validateFontBytes(bytes), { format, mimeType: `font/${format}` });
      assert.deepEqual(await store.load(), { status: 'unavailable' });
      const result = await store.importFont(bytes, `Example.${format}`);
      assert.equal(result.status, 'available'); assert.equal(result.fileName, `Example.${format}`);
      assert.equal(result.byteLength, bytes.length); assert.equal(result.sha256, sha(bytes));
      assert.equal(result.format, format);
      assert.deepEqual(Buffer.from(result.dataUrl.split(',')[1], 'base64'), bytes);
      assert.deepEqual(await createReadingFontStore(root).load(), result);
      assert.equal(JSON.stringify(result).includes(root), false);
      if (process.platform !== 'win32') assert.equal((await fs.stat(join(root, recordName))).mode & 0o777, 0o600);
    });
  });
}

test('bundled OFL Source Serif WOFF2 fonts preserve every byte without reading a font family name', async () => {
  for (const name of ['SourceSerif4Variable-Roman.ttf.woff2', 'SourceSerif4Variable-Italic.ttf.woff2']) {
    await withStore(async (store) => {
      const bytes = await fs.readFile(new URL(`../../src/fonts/source-serif-4/${name}`, import.meta.url));
      const result = await store.importFont(bytes, name);
      assert.equal(result.status, 'available'); assert.equal(result.sha256, sha(bytes));
      assert.deepEqual(Buffer.from(result.dataUrl.split(',')[1], 'base64'), bytes);
    });
  }
});

test('filename is a bounded safe basename, and format comes from bytes rather than claimed metadata', async () => {
  await withStore(async (store) => {
    const result = await store.importFont(font(), 'C:\\private\\<script>\u202E Evil\nFont.exe');
    assert.equal(result.status, 'available');
    assert.equal(result.fileName, 'script Evil Font.ttf');
    assert.doesNotMatch(result.fileName, /[<>\\/\u0000-\u001f\u202e]/);
    assert.equal((await store.importFont(font('otf'), '../..//.')).fileName, 'Imported font.otf');
    assert.ok((await store.importFont(font(), '字'.repeat(300) + '.ttf')).fileName.length <= 120);
  });
});

test('invalid and oversize bytes are rejected without changing the previous import', async () => {
  await withStore(async (store, root) => {
    const original = await store.importFont(font(), 'old.ttf');
    const stored = await fs.readFile(join(root, recordName));
    for (const bytes of [Buffer.from('MZ executable'), Buffer.from('<svg onload="evil()"/>'), Buffer.alloc(4), font().subarray(0, 31)]) {
      assert.deepEqual(await store.importFont(bytes, 'fake.woff'), { status: 'error', error: 'invalid-font' });
    }
    assert.deepEqual(await store.importFont(Buffer.alloc(MAX_READING_FONT_BYTES + 1), 'large.ttf'),
      { status: 'error', error: 'too-large' });
    assert.deepEqual(await store.load(), original);
    assert.deepEqual(await fs.readFile(join(root, recordName)), stored);
  });
});

test('WOFF declared lengths, reserved fields, table ranges, and WOFF2 compressed bounds must be sane', () => {
  for (const [format, mutate] of [
    ['woff', (bytes: Buffer) => bytes.writeUInt32BE(bytes.length + 1, 8)],
    ['woff', (bytes: Buffer) => bytes.writeUInt16BE(1, 14)],
    ['woff', (bytes: Buffer) => bytes.writeUInt16BE(0, 12)],
    ['woff', (bytes: Buffer) => bytes.writeUInt32BE(1, 48)],
    ['woff', (bytes: Buffer) => bytes.writeUInt32BE(100, 52)],
    ['woff2', (bytes: Buffer) => bytes.writeUInt32BE(1000, 20)],
    ['woff2', (bytes: Buffer) => bytes.writeUInt32BE(20, 28)],
    ['ttf', (bytes: Buffer) => bytes.writeUInt32BE(2000, 20)],
    ['otf', (bytes: Buffer) => bytes.writeUInt16BE(2000, 4)],
  ] as [string, (bytes: Buffer) => void][]) {
    const bytes = font(format); mutate(bytes);
    assert.throws(() => validateFontBytes(bytes), { message: 'invalid-font' });
  }
});

test('32 MiB limit accepts the documented large WOFF case but rejects one byte over limit', async () => {
  const bytes = Buffer.alloc(16 * 1024 * 1024);
  font('woff').copy(bytes); bytes.writeUInt32BE(bytes.length, 8);
  bytes.writeUInt32BE(bytes.length - 64, 52); bytes.writeUInt32BE(bytes.length - 64, 56);
  bytes.writeUInt32BE(bytes.length - 36, 16);
  assert.equal(validateFontBytes(bytes).format, 'woff');
  assert.throws(() => validateFontBytes(Buffer.alloc(MAX_READING_FONT_BYTES + 1)), { message: 'too-large' });
});

test('replacement and removal are durable and one app-local record is retained', async () => {
  await withStore(async (store, root) => {
    await store.importFont(font(), 'old.ttf');
    const newer = await store.importFont(font('otf'), 'new.otf');
    assert.deepEqual(await store.load(), newer);
    assert.deepEqual(await store.remove(), { status: 'unavailable' });
    assert.deepEqual(await createReadingFontStore(root).load(), { status: 'unavailable' });
    assert.deepEqual(await fs.readdir(root), [recordName]);
    assert.equal((await fs.readFile(join(root, recordName), 'utf8')).includes('base64'), false);
  });
});

test('corrupt, unsupported and checksum-mismatched records fail closed without replacement or deletion', async () => {
  for (const value of ['{broken', JSON.stringify({ version: 99, font: null }), JSON.stringify({ version: 1, font: {} })]) {
    await withStore(async (store, root) => {
      await fs.writeFile(join(root, recordName), value);
      for (const operation of [() => store.load(), () => store.importFont(font(), 'new.ttf'), () => store.remove()]) {
        assert.deepEqual(await operation(), { status: 'error', error: 'corrupt-state' });
        assert.equal(await fs.readFile(join(root, recordName), 'utf8'), value);
      }
    });
  }
  await withStore(async (store, root) => {
    await store.importFont(font(), 'old.ttf');
    const path = join(root, recordName);
    const record = JSON.parse(await fs.readFile(path, 'utf8'));
    record.font.sha256 = '0'.repeat(64); await fs.writeFile(path, JSON.stringify(record));
    assert.deepEqual(await store.load(), { status: 'error', error: 'corrupt-state' });
  });
});

test('rename, write, and read I/O failures return safe fixed codes and preserve previous bytes', async () => {
  await withStore(async (store, root) => {
    const previous = await store.importFont(font(), 'old.ttf');
    const stored = await fs.readFile(join(root, recordName));
    const fail = () => { throw Object.assign(new Error(`secret path: ${root}`), { code: 'EACCES' }); };
    for (const io of [{ ...fs, rename: fail }, { ...fs, open: async (path: string, ...args: any[]) => {
      if (String(path).endsWith('.tmp')) return fail();
      return fs.open(path, ...args);
    } }]) {
      const failing = createReadingFontStore(root, io);
      assert.deepEqual(await failing.importFont(font('otf'), 'new.otf'), { status: 'error', error: 'write-failed' });
      assert.deepEqual(await failing.remove(), { status: 'error', error: 'write-failed' });
      assert.deepEqual(await store.load(), previous);
      assert.deepEqual(await fs.readFile(join(root, recordName)), stored);
      assert.deepEqual(await fs.readdir(root), [recordName]);
    }
    const failing = createReadingFontStore(root, { ...fs, open: fail });
    assert.deepEqual(await failing.load(), { status: 'error', error: 'read-failed' });
    assert.deepEqual(await failing.importFont(font(), 'new.ttf'), { status: 'error', error: 'read-failed' });
    assert.deepEqual(await failing.remove(), { status: 'error', error: 'read-failed' });
  });
});

test('queued imports snapshot input bytes and serialize with remove and load', async () => {
  await withStore(async (store) => {
    const bytes = font(); const expected = Buffer.from(bytes);
    const importing = store.importFont(bytes, 'old.ttf'); bytes.fill(0);
    const reading = store.load(); const removing = store.remove();
    assert.deepEqual(Buffer.from((await importing).dataUrl.split(',')[1], 'base64'), expected);
    assert.equal((await reading).status, 'available');
    assert.deepEqual(await removing, { status: 'unavailable' });
    assert.deepEqual(await store.load(), { status: 'unavailable' });
  });
});

test('non-BMP display filenames are bounded without truncating a Unicode character', async () => {
  await withStore(async (store) => {
    const result = await store.importFont(font(), '🖋'.repeat(200) + '.ttf');
    assert.ok(result.fileName.length <= 120);
    assert.equal(result.fileName.isWellFormed(), true);
    assert.deepEqual(await store.load(), result);
  });
});

test('partial writes and file-sync failures never replace or remove the old font', async () => {
  await withStore(async (store, root) => {
    const previous = await store.importFont(font(), 'old.ttf');
    for (const stage of ['writeFile', 'sync', 'close']) {
      const io = { ...fs, open: async (path: string, ...args: any[]) => {
        const handle = await fs.open(path, ...args);
        if (!String(path).endsWith('.tmp')) return handle;
        const original = handle[stage].bind(handle); let failed = false;
        handle[stage] = async (...values: any[]) => {
          if (failed) return original(...values);
          failed = true;
          if (stage === 'writeFile') await original('{partial');
          throw new Error(`private ${root}`);
        };
        return handle;
      } };
      const failing = createReadingFontStore(root, io);
      assert.deepEqual(await failing.importFont(font('otf'), 'new.otf'), { status: 'error', error: 'write-failed' });
      assert.deepEqual(await failing.remove(), { status: 'error', error: 'write-failed' });
      assert.deepEqual(await store.load(), previous);
      assert.deepEqual(await fs.readdir(root), [recordName]);
    }
  });
});

test('oversized durable records and non-regular storage fail closed before reading contents', async () => {
  await withStore(async (store, root) => {
    const path = join(root, recordName);
    await fs.writeFile(path, 'x');
    await fs.truncate(path, 48 * 1024 * 1024);
    assert.deepEqual(await store.load(), { status: 'error', error: 'corrupt-state' });
    assert.deepEqual(await store.remove(), { status: 'error', error: 'corrupt-state' });
    assert.equal((await fs.stat(path)).size, 48 * 1024 * 1024);
    await fs.unlink(path); await fs.mkdir(path);
    assert.deepEqual(await store.load(), { status: 'error', error: 'corrupt-state' });
  });
});

test('durable record symlinks are not read, overwritten or followed', { skip: process.platform === 'win32' }, async () => {
  await withStore(async (store, root) => {
    const target = join(root, 'original'); await fs.writeFile(target, 'private target');
    const path = join(root, recordName); await fs.symlink(target, path);
    assert.deepEqual(await store.load(), { status: 'error', error: 'corrupt-state' });
    assert.deepEqual(await store.importFont(font(), 'new.ttf'), { status: 'error', error: 'corrupt-state' });
    assert.deepEqual(await store.remove(), { status: 'error', error: 'corrupt-state' });
    assert.equal(await fs.readlink(path), target);
    assert.equal(await fs.readFile(target, 'utf8'), 'private target');
  });
});

test('bounded Uint8Array views use only their selected bytes and exact 32 MiB remains accepted', async () => {
  await withStore(async (store) => {
    const bytes = font(); const surrounding = Buffer.concat([Buffer.alloc(3), bytes, Buffer.alloc(5)]);
    const view = new Uint8Array(surrounding.buffer, surrounding.byteOffset + 3, bytes.length);
    const imported = await store.importFont(view, 'slice.ttf');
    assert.deepEqual(Buffer.from(imported.dataUrl.split(',')[1], 'base64'), bytes);
  });
  const bytes = Buffer.alloc(MAX_READING_FONT_BYTES);
  font('woff').copy(bytes); bytes.writeUInt32BE(bytes.length, 8);
  bytes.writeUInt32BE(bytes.length - 64, 52); bytes.writeUInt32BE(bytes.length - 64, 56);
  bytes.writeUInt32BE(bytes.length - 36, 16);
  assert.equal(validateFontBytes(bytes).format, 'woff');
});

test('a named-pipe durable record fails closed before open can block', { skip: process.platform === 'win32' }, async () => {
  const { execFileSync } = await import('node:child_process');
  await withStore(async (store, root) => {
    execFileSync('mkfifo', [join(root, 'reading-font.json')]);
    assert.deepEqual(await store.load(), { status: 'error', error: 'corrupt-state' });
  });
});
