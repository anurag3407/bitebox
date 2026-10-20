// Generates PWA icons without image dependencies: rasterises a few shapes with
// 4x4 supersampling and writes PNGs with node:zlib. Run: node scripts/generate-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");
const BRAND = [217, 45, 71];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = pixel((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const inRoundedRect = (u, v, inset, radius) => {
  const x = Math.min(u - inset, 1 - inset - u), y = Math.min(v - inset, 1 - inset - v);
  if (x < 0 || y < 0) return false;
  if (x >= radius || y >= radius) return true;
  return (radius - x) ** 2 + (radius - y) ** 2 <= radius ** 2;
};

// A steaming bowl: bowl = lower half-disc, rim = bar, steam = three rounded strokes
function glyph(u, v, scale = 1) {
  const cx = 0.5, s = scale;
  const bu = (u - cx) / s, bv = (v - 0.5) / s;
  const bowl = bv >= 0.02 && bv <= 0.26 && bu * bu + (bv - 0.02) ** 2 <= 0.27 ** 2;
  const rim = Math.abs(bv - 0.0) <= 0.035 && Math.abs(bu) <= 0.32;
  const base = Math.abs(bv - 0.29) <= 0.03 && Math.abs(bu) <= 0.12;
  let steam = false;
  for (const off of [-0.13, 0, 0.13]) {
    const t = bv + 0.12;
    if (t <= 0 && t >= -0.22) {
      const sx = off + 0.035 * Math.sin((t / 0.22) * Math.PI * 2);
      if (Math.abs(bu - sx) <= 0.028) steam = true;
    }
  }
  return bowl || rim || base || steam;
}

const icon = (maskable) => (u, v) => {
  // Maskable icons fill the canvas and keep the glyph inside the 80% safe zone
  const bg = maskable ? true : inRoundedRect(u, v, 0.02, 0.2);
  if (!bg) return [0, 0, 0, 0];
  return glyph(u, v, maskable ? 0.72 : 0.9) ? [...WHITE, 1] : [...BRAND, 1];
};
const badge = (u, v) => (glyph(u, v, 1.1) ? [...WHITE, 1] : [0, 0, 0, 0]);

const targets = [
  ["icon-192.png", 192, icon(false)],
  ["icon-512.png", 512, icon(false)],
  ["maskable-512.png", 512, icon(true)],
  ["apple-touch-icon.png", 180, icon(true)],
  ["favicon-32.png", 32, icon(false)],
  ["badge-96.png", 96, badge],
];
for (const [name, size, fn] of targets) {
  writeFileSync(path.join(OUT, name), png(size, fn));
  console.log(`wrote ${name}`);
}
