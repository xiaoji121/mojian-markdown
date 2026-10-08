// Imported fonts stay in app-local userData. Only the native dialog boundary may
// supply bytes; this module never opens a renderer-provided or source-file path.
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const MAX_READING_FONT_BYTES = 32 * 1024 * 1024;
const MAX_RECORD_BYTES = Math.ceil(MAX_READING_FONT_BYTES / 3) * 4 + 4096;
const MAX_SFNT_BYTES = 128 * 1024 * 1024;
const MIME = { woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' };
const WOFF2_TAGS = ('cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp hdmx kern '
  + 'LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG_ sbix acnt avar bdat bloc '
  + 'bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill')
  .split(' ').map(tag => tag.replace('_', ' '));
const fail = (code = 'invalid-font') => { throw new Error(code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const padded = length => Math.ceil(length / 4) * 4;
const sfntFlavor = flavor => [0x00010000, 0x4f54544f, 0x74727565].includes(flavor);

function checkRange(offset, length, minimum, total) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
    || offset < minimum || length < 1 || offset + length > total) fail();
}
function checkNonoverlapping(ranges) {
  ranges.sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < ranges.length; index++) {
    if (ranges[index][0] < ranges[index - 1][1]) fail();
  }
}
function addTable(bytes, offset, length, directoryEnd, ranges) {
  if (offset % 4 !== 0) fail();
  checkRange(offset, length, directoryEnd, bytes.length);
  ranges.push([offset, offset + length]);
}
function checkSfnt(bytes) {
  if (bytes.length < 12) fail();
  const count = bytes.readUInt16BE(4);
  const directoryEnd = 12 + count * 16;
  if (!count || count > 4095 || directoryEnd > bytes.length) fail();
  const power = Math.floor(Math.log2(count));
  if (bytes.readUInt16BE(6) !== 16 * 2 ** power || bytes.readUInt16BE(8) !== power
    || bytes.readUInt16BE(10) !== count * 16 - 16 * 2 ** power) fail();
  const ranges = []; const tags = new Set();
  for (let offset = 12; offset < directoryEnd; offset += 16) {
    const tag = bytes.readUInt32BE(offset);
    if (tags.has(tag)) fail();
    tags.add(tag);
    addTable(bytes, bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12), directoryEnd, ranges);
  }
  checkNonoverlapping(ranges);
}
function checkOptionalBlocks(bytes, headerSize, ranges) {
  const metaPosition = headerSize === 44 ? 24 : 28;
  const metaOffset = bytes.readUInt32BE(metaPosition);
  const metaLength = bytes.readUInt32BE(metaPosition + 4);
  const metaOriginalLength = bytes.readUInt32BE(metaPosition + 8);
  const privateOffset = bytes.readUInt32BE(metaPosition + 12);
  const privateLength = bytes.readUInt32BE(metaPosition + 16);
  if (metaOffset) {
    checkRange(metaOffset, metaLength, headerSize, bytes.length);
    if (!metaOriginalLength || metaOriginalLength > MAX_SFNT_BYTES) fail();
    ranges.push([metaOffset, metaOffset + metaLength]);
  } else if (metaLength || metaOriginalLength) fail();
  if (privateOffset) {
    checkRange(privateOffset, privateLength, headerSize, bytes.length);
    ranges.push([privateOffset, privateOffset + privateLength]);
  } else if (privateLength) fail();
  checkNonoverlapping(ranges);
}
function checkWoffHeader(bytes, headerSize) {
  if (bytes.length < headerSize || !sfntFlavor(bytes.readUInt32BE(4))
    || bytes.readUInt32BE(8) !== bytes.length || bytes.readUInt16BE(14) !== 0) fail();
  const count = bytes.readUInt16BE(12);
  const sfntLength = bytes.readUInt32BE(16);
  if (!count || count > 4095 || sfntLength < 12 + count * 16 || sfntLength > MAX_SFNT_BYTES) fail();
  return count;
}
function checkWoff(bytes) {
  const count = checkWoffHeader(bytes, 44);
  const directoryEnd = 44 + count * 20;
  if (directoryEnd > bytes.length) fail();
  const ranges = [[0, directoryEnd]]; const tags = new Set();
  let sfntLength = 12 + count * 16;
  for (let offset = 44; offset < directoryEnd; offset += 20) {
    const tag = bytes.readUInt32BE(offset);
    const compressed = bytes.readUInt32BE(offset + 8);
    const original = bytes.readUInt32BE(offset + 12);
    if (tags.has(tag) || compressed > original) fail();
    tags.add(tag);
    addTable(bytes, bytes.readUInt32BE(offset + 4), compressed, directoryEnd, ranges);
    sfntLength += padded(original);
  }
  if (sfntLength !== bytes.readUInt32BE(16)) fail();
  checkOptionalBlocks(bytes, 44, ranges);
}
function readBase128(bytes, cursor) {
  let value = 0;
  for (let index = 0; index < 5; index++) {
    if (cursor.offset >= bytes.length) fail();
    const byte = bytes[cursor.offset++];
    if ((index === 0 && byte === 0x80) || value > 0x1ffffff) fail();
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  fail();
}
function readWoff2Table(bytes, cursor, tags) {
  if (cursor.offset >= bytes.length) fail();
  const flags = bytes[cursor.offset++];
  const index = flags & 0x3f;
  let tag = WOFF2_TAGS[index];
  if (index === 63) {
    if (cursor.offset + 4 > bytes.length) fail();
    tag = bytes.toString('latin1', cursor.offset, cursor.offset + 4); cursor.offset += 4;
  }
  if (tags.has(tag)) fail();
  tags.add(tag);
  const length = readBase128(bytes, cursor);
  const version = flags >> 6;
  const outlines = tag === 'glyf' || tag === 'loca';
  if (outlines ? ![0, 3].includes(version) : (version !== 0 && !(tag === 'hmtx' && version === 1))) fail();
  if (outlines ? version === 0 : version !== 0) {
    const transformedLength = readBase128(bytes, cursor);
    if ((tag === 'loca' && transformedLength !== 0) || transformedLength > MAX_SFNT_BYTES) fail();
  }
  return length;
}
function checkWoff2(bytes) {
  const count = checkWoffHeader(bytes, 48);
  const cursor = { offset: 48 }; const tags = new Set();
  let sfntLength = 12 + count * 16;
  for (let index = 0; index < count; index++) sfntLength += padded(readWoff2Table(bytes, cursor, tags));
  // WOFF2 transform reconstruction may change padding/loca representation; its
  // declared reconstructed size is only a bound, not proof of a decodable font.
  if (sfntLength > MAX_SFNT_BYTES) fail();
  const compressed = bytes.readUInt32BE(20);
  checkRange(cursor.offset, compressed, 48, bytes.length);
  checkOptionalBlocks(bytes, 48, [[0, cursor.offset + compressed]]);
}

// Header/range checks are not a font sanitizer. The renderer must successfully
// load the native-dialog candidate with FontFace before authorizing its commit.
// No font-supplied family name, table string, or program is evaluated here.
export function validateFontBytes(value) {
  if (!(value instanceof Uint8Array)) fail();
  if (value.byteLength > MAX_READING_FONT_BYTES) fail('too-large');
  if (value.byteLength < 4) fail();
  const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  const signature = bytes.readUInt32BE(0);
  let format;
  if (signature === 0x774f4646) { format = 'woff'; checkWoff(bytes); }
  else if (signature === 0x774f4632) { format = 'woff2'; checkWoff2(bytes); }
  else if (sfntFlavor(signature)) { format = signature === 0x4f54544f ? 'otf' : 'ttf'; checkSfnt(bytes); }
  else fail();
  return { format, mimeType: MIME[format] };
}

export function sanitizeFontFileName(value, format) {
  const basename = typeof value === 'string' ? value.split(/[\\/]/).pop() : '';
  const stem = (basename || '').replace(/\.[^.]*$/, '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, ' ')
    .replace(/[<>:"|?*]/g, '').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
  const extension = Object.hasOwn(MIME, format) ? format : 'font';
  // Preserve Unicode names but never paths, control characters or markup.
  const shortened = (stem || 'Imported font').toWellFormed().slice(0, 110).replace(/[\uD800-\uDBFF]$/, '');
  return `${shortened}.${extension}`;
}
function fontResult(font) {
  if (!font) return { status: 'unavailable' };
  return { status: 'available', fileName: font.fileName, format: font.format, byteLength: font.byteLength,
    sha256: font.sha256, dataUrl: `data:${MIME[font.format]};base64,${font.base64}` };
}
function prepareFont(bytes, fileName) {
  const { format } = validateFontBytes(bytes);
  return { fileName: sanitizeFontFileName(fileName, format), format, byteLength: bytes.length,
    sha256: hash(bytes), base64: bytes.toString('base64') };
}
function parseRecord(raw) {
  try {
    const record = JSON.parse(raw.toString('utf8'));
    if (!record || record.version !== 1 || !Object.hasOwn(record, 'font')) fail();
    if (record.font === null) return null;
    const font = record.font;
    if (!font || typeof font !== 'object' || !Object.hasOwn(MIME, font.format)
      || typeof font.fileName !== 'string' || sanitizeFontFileName(font.fileName, font.format) !== font.fileName
      || !Number.isInteger(font.byteLength) || font.byteLength < 1 || font.byteLength > MAX_READING_FONT_BYTES
      || typeof font.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(font.sha256)
      || typeof font.base64 !== 'string' || font.base64.length !== Math.ceil(font.byteLength / 3) * 4) fail();
    const bytes = Buffer.from(font.base64, 'base64');
    if (bytes.length !== font.byteLength || bytes.toString('base64') !== font.base64 || hash(bytes) !== font.sha256
      || validateFontBytes(bytes).format !== font.format) fail();
    return { fileName: font.fileName, format: font.format, byteLength: font.byteLength,
      sha256: font.sha256, base64: font.base64 };
  } catch { fail('corrupt-state'); }
}
async function readRecord(path, io) {
  let handle;
  try {
    const initial = await io.lstat(path);
    if (!initial.isFile() || initial.isSymbolicLink() || initial.size < 1 || initial.size > MAX_RECORD_BYTES) fail('corrupt-state');
    handle = await io.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)
      | (process.platform === 'win32' ? 0 : constants.O_NONBLOCK || 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_RECORD_BYTES) fail('corrupt-state');
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) fail('corrupt-state');
    return parseRecord(bytes.subarray(0, offset));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    fail(error.message === 'corrupt-state' || error.code === 'ELOOP' ? 'corrupt-state' : 'read-failed');
  } finally { if (handle) await handle.close().catch(() => {}); }
}
async function persistRecord(path, userData, font, io) {
  let temporary = `${path}.${randomUUID()}.tmp`; let handle;
  try {
    await io.mkdir(userData, { recursive: true, mode: 0o700 });
    handle = await io.open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ version: 1, font }), 'utf8');
    await handle.sync(); await handle.close(); handle = null;
    await io.rename(temporary, path); temporary = null;
    // Rename is the commit point. A directory-sync failure after it cannot
    // truthfully be reported as an uncommitted import that kept the old bytes.
    if (process.platform !== 'win32') {
      let directory;
      try { directory = await io.open(userData, 'r'); await directory.sync(); }
      catch {} finally { if (directory) await directory.close().catch(() => {}); }
    }
  } catch { fail('write-failed'); }
  finally {
    if (handle) await handle.close().catch(() => {});
    if (temporary) await io.unlink(temporary).catch(() => {});
  }
}

export function createReadingFontStore(userData, io = fs) {
  const path = join(userData, 'reading-font.json');
  let pending = Promise.resolve();
  function enqueue(operation) {
    const result = pending.then(operation).catch(error => ({ status: 'error', error: error.message }));
    pending = result.then(() => undefined);
    return result;
  }
  async function replace(font) {
    // Never overwrite/delete a damaged or unreadable prior import, even when a
    // caller has not explicitly loaded it first. Removal writes an atomic tombstone.
    await readRecord(path, io);
    await persistRecord(path, userData, font, io);
    return fontResult(font);
  }
  function importFont(value, fileName) {
    let font;
    try {
      // Snapshot synchronously so a caller cannot mutate an in-flight candidate.
      validateFontBytes(value);
      font = prepareFont(Buffer.from(value), fileName);
    } catch (error) {
      return Promise.resolve({ status: 'error', error: error.message === 'too-large' ? 'too-large' : 'invalid-font' });
    }
    return enqueue(() => replace(font));
  }
  return { load: () => enqueue(async () => fontResult(await readRecord(path, io))),
    importFont, remove: () => enqueue(() => replace(null)) };
}
