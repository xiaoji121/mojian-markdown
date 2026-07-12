// Generates the browser-extension toolbar icons (a dark rounded square with
// an amber "M↓" pixel glyph) without any image dependency: pixels are packed
// into PNG chunks by hand. Output goes to extension/public/icons/.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../extension/public/icons');
const SIZES = [16, 32, 48, 128];
const BACKGROUND = [0x1c, 0x18, 0x14]; // mojian panel ink
const GLYPH = [0xf0, 0xa8, 0x38]; // mojian amber accent

// 16x16 design grid; listed columns are glyph pixels ("M" at 1-7, "↓" at 9-14).
const GLYPH_ROWS = new Map([
  [4, [1, 2, 6, 7, 11, 12]],
  [5, [1, 2, 3, 5, 6, 7, 11, 12]],
  [6, [1, 2, 4, 6, 7, 11, 12]],
  [7, [1, 2, 6, 7, 11, 12]],
  [8, [1, 2, 6, 7, 11, 12]],
  [9, [1, 2, 6, 7, 9, 10, 11, 12, 13, 14]],
  [10, [1, 2, 6, 7, 10, 11, 12, 13]],
  [11, [1, 2, 6, 7, 11, 12]]
]);

function isGlyphPixel(gridX, gridY) {
  return (GLYPH_ROWS.get(gridY) ?? []).includes(gridX);
}

function insideRoundedSquare(x, y, size) {
  const radius = Math.max(2, Math.round(size * 0.19));
  const min = radius - 0.5;
  const max = size - radius - 0.5;
  const cx = x < min ? min : x > max ? max : x;
  const cy = y < min ? min : y > max ? max : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
}

function renderIcon(size) {
  const scale = size / 16;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      if (!insideRoundedSquare(x, y, size)) continue; // transparent
      const glyph = isGlyphPixel(Math.floor(x / scale), Math.floor(y / scale));
      const [r, g, b] = glyph ? GLYPH : BACKGROUND;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 0xff;
    }
  }
  return pixels;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    pixels.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, renderIcon(size)));
  console.log(`wrote ${file}`);
}
