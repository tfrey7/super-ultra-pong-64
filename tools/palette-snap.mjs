#!/usr/bin/env node
/*
 * tools/palette-snap.mjs -- move a generated PNG onto a console's palette,
 * offline, once, so the game never has to loop over pixels to do it.
 *
 *   node tools/palette-snap.mjs --bits 3 assets/pixellab/genesis-court.png [more.png ...]
 *
 * Each colour channel is snapped to the nearest of 2^bits evenly spaced levels
 * (3 bits is the Sega Genesis: 8 levels a channel, 512 colours, the same
 * LEVELS src/eras/era3-genesis.js paints with), and alpha is cut to fully
 * clear or fully solid at --alpha-cut (default 128), because a 1989 sprite had
 * no half-transparent pixels. The file is rewritten in place as 8-bit RGBA.
 *
 * When the PNG has an entry in the manifest.json beside it (written by
 * tools/pixellab.mjs), that entry is brought up to date: its sha256 and bytes
 * now describe the snapped file, and a `palette` block records the snap and
 * the sha256 of the image pixellab returned, so the whole chain -- the request,
 * then this snap -- reproduces the committed picture. With --trim the image is
 * also cropped to its solid pixels, and the block's `trim` names the box
 * [x, y, w, h] of the original that was kept.
 *
 * Node 22+ (zlib.crc32), no dependencies. Reads colour types 2 (RGB), 6 (RGBA)
 * and 3 (palette, with tRNS), 8 bits a channel, not interlaced -- what pixellab
 * sends. Anything else is refused by name rather than guessed at.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SIG = Buffer.from('89504e470d0a1a0a', 'hex');

/** The 2^bits channel levels: 3 bits -> 00 24 49 6d 92 b6 db ff. */
export function levels(bits) {
  const n = (1 << bits) - 1;
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * 255 / n));
}

/** A channel value moved to the nearest level. */
export function snap(v, bits) {
  const n = (1 << bits) - 1;
  return Math.round(Math.round(v * n / 255) * 255 / n);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
}

/** A PNG buffer -> { width, height, rgba } (rgba: 4 bytes a pixel). */
export function decode(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let at = 8;
  let ihdr = null;
  let plte = null;
  let trns = null;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colour = ihdr[9];
  if (depth !== 8 || ihdr[12] !== 0 || ![2, 3, 6].includes(colour)) {
    throw new Error(`unsupported PNG: bit depth ${depth}, colour type ${colour}, interlace ${ihdr[12]}`);
  }
  const bpp = colour === 6 ? 4 : colour === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y > 0 ? px[row - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[row - stride + x - bpp] : 0;
      const v = raw[src + x];
      px[row + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b :
        f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (colour === 6) px.copy(rgba, i * 4, i * 4, i * 4 + 4);
    else if (colour === 2) { px.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = 255; }
    else {
      const k = px[i];
      rgba[i * 4] = plte[k * 3]; rgba[i * 4 + 1] = plte[k * 3 + 1]; rgba[i * 4 + 2] = plte[k * 3 + 2];
      rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { width, height, rgba };
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** { width, height, rgba } -> an 8-bit RGBA PNG buffer. */
export function encode({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))]);
}

/** Snap every pixel of a decoded image to the palette; answers a new image. */
export function snapImage(img, bits, alphaCut = 128) {
  const out = Buffer.from(img.rgba);
  for (let i = 0; i < out.length; i += 4) {
    const solid = out[i + 3] >= alphaCut;
    out[i] = solid ? snap(out[i], bits) : 0;
    out[i + 1] = solid ? snap(out[i + 1], bits) : 0;
    out[i + 2] = solid ? snap(out[i + 2], bits) : 0;
    out[i + 3] = solid ? 255 : 0;
  }
  return { width: img.width, height: img.height, rgba: out };
}

/**
 * Crop an image to the box of its solid pixels, so a sprite drawn into a
 * rectangle fills it (a generated 16x96 paddle is a narrower bar in a clear
 * frame). Answers the image and the box [x, y, w, h] it kept.
 */
export function trim(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.rgba[(y * img.width + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { image: img, box: [0, 0, img.width, img.height] };
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((y + y0) * img.width + x0) * 4;
    img.rgba.copy(rgba, y * width * 4, from, from + width * 4);
  }
  return { image: { width, height, rgba }, box: [x0, y0, width, height] };
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function main(argv, log = console.log) {
  let bits = null;
  let alphaCut = 128;
  let cropping = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bits') bits = Number(argv[++i]);
    else if (argv[i] === '--alpha-cut') alphaCut = Number(argv[++i]);
    else if (argv[i] === '--trim') cropping = true;
    else files.push(argv[i]);
  }
  if (!Number.isInteger(bits) || bits < 1 || bits > 8 || !files.length) {
    log('usage: node tools/palette-snap.mjs --bits <1..8> [--alpha-cut 128] [--trim] <file.png> [...]');
    return 1;
  }
  for (const file of files) {
    const before = fs.readFileSync(file);
    let img = snapImage(decode(before), bits, alphaCut);
    let box = null;
    if (cropping) ({ image: img, box } = trim(img));
    const png = encode(img);
    fs.writeFileSync(file, png);
    const manifestPath = path.join(path.dirname(file), 'manifest.json');
    let note = 'no manifest entry';
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const entry = (manifest.images || []).find((e) => e.file === path.basename(file));
      if (entry) {
        const source = entry.palette ? entry.palette.sourceSha256 : entry.sha256;
        entry.palette = { tool: 'tools/palette-snap.mjs', bits, levels: levels(bits), alphaCut, sourceSha256: source };
        if (box) entry.palette.trim = { box, width: img.width, height: img.height };
        entry.sha256 = sha(png);
        entry.bytes = png.length;
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        note = 'manifest entry updated';
      }
    }
    log(`snapped ${file} to ${bits} bits a channel (${before.length} -> ${png.length} bytes; ${note})`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
