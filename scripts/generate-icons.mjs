/**
 * Renders the LedgerLens app icon to PNG at the sizes browsers actually ask for.
 *
 * The icon is composed from plain geometry rather than an SVG rasteriser, which
 * keeps the toolchain free of a native image dependency. Shapes are drawn at 4x
 * and box-filtered down, which is enough anti-aliasing for a flat mark.
 *
 * Run with: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SUPERSAMPLE = 4;

const GRADIENT_FROM = [59, 130, 246];
const GRADIENT_TO = [30, 58, 138];
const WHITE = [255, 255, 255];

/** Draws a shape and returns coverage 0..1 for the pixel at normalised coords. */
const shapes = [
  roundedRect(29, 10, 6, 19, 3),
  triangle([32, 40], [22.5, 28.5], [41.5, 28.5]),
  { ...roundedRect(15, 45, 34, 5.5, 2.75), alpha: 0.95 },
  { ...roundedRect(15, 54, 21, 5.5, 2.75), alpha: 0.7 },
];

/** Background plate with a diagonal gradient. */
function background(x, y) {
  if (!insideRoundedRect(x, y, 0, 0, 64, 64, 14)) return null;
  const t = (x / 64 + y / 64) / 2;
  return [
    GRADIENT_FROM[0] + (GRADIENT_TO[0] - GRADIENT_FROM[0]) * t,
    GRADIENT_FROM[1] + (GRADIENT_TO[1] - GRADIENT_FROM[1]) * t,
    GRADIENT_FROM[2] + (GRADIENT_TO[2] - GRADIENT_FROM[2]) * t,
  ];
}

function roundedRect(x0, y0, w, h, r) {
  return {
    alpha: 1,
    covers: (x, y) => insideRoundedRect(x, y, x0, y0, w, h, r),
  };
}

function triangle(a, b, c) {
  return {
    alpha: 1,
    covers: (x, y) => {
      const d1 = sign(x, y, a, b, c);
      const d2 = sign(x, y, b, c, a);
      const d3 = sign(x, y, c, a, b);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      return !(hasNeg && hasPos);
    },
  };
}

function sign(px, py, a, b, c) {
  return (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
}

function insideRoundedRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;

  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = ((px + (sx + 0.5) / SUPERSAMPLE) / size) * 64;
          const y = ((py + (sy + 0.5) / SUPERSAMPLE) / size) * 64;

          const plate = background(x, y);
          if (!plate) continue;

          let [cr, cg, cb] = plate;
          for (const shape of shapes) {
            if (!shape.covers(x, y)) continue;
            const mix = shape.alpha;
            cr = cr * (1 - mix) + WHITE[0] * mix;
            cg = cg * (1 - mix) + WHITE[1] * mix;
            cb = cb * (1 - mix) + WHITE[2] * mix;
          }

          r += cr;
          g += cg;
          b += cb;
          a += 255;
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const offset = (py * size + px) * 4;
      const alpha = a / samples;

      // Un-premultiply so partially covered edge pixels keep their colour.
      const coverage = alpha / 255;
      pixels[offset] = coverage > 0 ? Math.round(r / samples / coverage) : 0;
      pixels[offset + 1] = coverage > 0 ? Math.round(g / samples / coverage) : 0;
      pixels[offset + 2] = coverage > 0 ? Math.round(b / samples / coverage) : 0;
      pixels[offset + 3] = Math.round(alpha);
    }
  }

  return pixels;
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const TARGETS = [
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-64.png', size: 64 },
  { file: 'favicon-192.png', size: 192 },
  { file: 'favicon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const { file, size } of TARGETS) {
  const png = encodePng(size, render(size));
  writeFileSync(resolve(OUTPUT_DIR, file), png);
  console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
