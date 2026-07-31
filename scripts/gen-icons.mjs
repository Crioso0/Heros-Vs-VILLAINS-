/**
 * Generate the app icons.
 *
 * The game ships no image assets — every character and backdrop is drawn
 * procedurally at runtime — so the icons are drawn procedurally too, and this
 * script writes real PNGs with nothing but `node:zlib`. No canvas, no sharp, no
 * dependency at all.
 *
 * iOS needs a genuine `apple-touch-icon` PNG: without one, Add to Home Screen
 * uses a screenshot of the page, which for a canvas game mid-boot is a black
 * tile. It must be opaque and square — iOS applies its own mask, and composites
 * any alpha against black.
 *
 *   npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

/* ---------------------------------------------------------------- *
 * Minimal PNG encoder (truecolour, 8-bit, no alpha)
 * ---------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgb: Uint8Array of size*size*3 */
function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10..12 = compression, filter, interlace — all 0

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const o = y * (size * 3 + 1);
    raw[o] = 0;
    rgb.copy ? rgb.copy(raw, o + 1, y * size * 3, (y + 1) * size * 3)
             : Buffer.from(rgb.subarray(y * size * 3, (y + 1) * size * 3)).copy(raw, o + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- *
 * The mark: the shield and diamond from the browser-tab favicon
 * ---------------------------------------------------------------- */

const BG = [0x0b, 0x12, 0x26];
const SHIELD = [0x15, 0x52, 0xc4];
const DIAMOND = [0xff, 0xe1, 0x4d];

/** Point-in-polygon, even-odd. */
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Sample the mark in a 32x32 design space.
 * `inset` shrinks the glyph, which is what a maskable icon needs so the mark
 * survives Android's circular crop.
 */
function sample(u, v, inset) {
  const cx = 16;
  const cy = 16;
  const x = cx + (u - cx) / inset;
  const y = cy + (v - cy) / inset;

  // Shield: a rounded crest, points down.
  const shield = [16, 4, 25, 8, 25, 16, 21, 23, 16, 27, 11, 23, 7, 16, 7, 8];
  if (!inPoly(x, y, shield)) return BG;

  // Diamond emblem.
  const diamond = [16, 10, 20.5, 16, 16, 24, 11.5, 16];
  return inPoly(x, y, diamond) ? DIAMOND : SHIELD;
}

function render(size, { inset = 1 } = {}) {
  const rgb = Buffer.alloc(size * size * 3);
  const SS = 4; // supersample factor
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 32;
          const v = ((y + (sy + 0.5) / SS) / size) * 32;
          const col = sample(u, v, inset);
          r += col[0];
          g += col[1];
          b += col[2];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 3;
      rgb[o] = Math.round(r / n);
      rgb[o + 1] = Math.round(g / n);
      rgb[o + 2] = Math.round(b / n);
    }
  }
  return rgb;
}

mkdirSync(OUT, { recursive: true });

const targets = [
  // iOS home screen. Opaque and square on purpose — iOS masks it itself.
  ['apple-touch-icon-180.png', 180, {}],
  // Android / Chrome install.
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  // Maskable: the glyph must survive a circular crop, so it sits in the
  // middle 80% of the canvas.
  ['icon-maskable-512.png', 512, { inset: 0.8 }],
];

for (const [name, size, opts] of targets) {
  const png = encodePng(size, render(size, opts));
  writeFileSync(join(OUT, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
