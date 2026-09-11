#!/usr/bin/env node
/*
 * assets/pixellab/era4-snes-embed.mjs -- fit the Super Nintendo era's generated
 * art to the machine, offline, and embed it in the era file.
 *
 *   node assets/pixellab/era4-snes-embed.mjs
 *
 * Reads the three pixellab images beside this file (their prompts, seeds and
 * requests are in manifest.json, item 1180) and writes the three pictures era 4
 * draws:
 *
 *   snes-sky.png     (256x48) -> era4-sky.png     the dusk sky and mountains
 *   snes-paddle.png  (16x64)  -> era4-paddle.png  the grey capsule each side dyes
 *   snes-ball.png    (32x32)  -> era4-ball.png    the glowing orb
 *
 * Two things make them Super Nintendo pictures rather than modern ones:
 *
 *   - Every colour is snapped to the console's 15-bit colour, five bits a
 *     channel (32,768 colours; BGR555 in the hardware), expanded back to 8 bits
 *     the way an emulator shows it: v5 = round(v * 31 / 255), v8 = v5 << 3 | v5 >> 2.
 *     So white stays #ffffff and the ball's core keeps R1 (ERAS.md).
 *   - Sprite transparency is one bit on the SNES: a pixel is drawn or it is not.
 *     Alpha is cut at half, so the paddle and ball have hard edges.
 *
 * Then it rewrites the block between the BEGIN/END pixellab markers in
 * src/eras/era4-snes.js with the three PNGs as data: URIs -- embedded, not
 * loaded off disk, for the reason item 1178 measured: a page opened from
 * file:// counts a file image as another origin and it taints the canvas, and
 * the playtest's getImageData then throws; a data: image does not.
 *
 * All pixel work happens here, once; the game only ever calls drawImage.
 * Node 18+, no dependencies. The PNG reader and writer are era 2's
 * (era2-nes-quantize.mjs), imported rather than copied.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './era2-nes-quantize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ERA_FILE = path.join(HERE, '..', '..', 'src', 'eras', 'era4-snes.js');
export const PIECES = [
  { key: 'sky', from: 'snes-sky.png', to: 'era4-sky.png' },
  // The paddle is cropped to the pixels it draws (10x58 of its 16x64), so it
  // fills the whole rectangle the rules collide with rather than two thirds of it.
  { key: 'paddle', from: 'snes-paddle.png', to: 'era4-paddle.png', crop: true },
  { key: 'ball', from: 'snes-ball.png', to: 'era4-ball.png' },
  // Item 1227's set dressing: the hot-air balloon and the marker pylon, each
  // cropped to the pixels it draws.
  { key: 'balloon', from: 'era4-balloon.png', to: 'era4-balloon-snes.png', crop: true, card: 'item 1227' },
  { key: 'pylon', from: 'era4-pylon.png', to: 'era4-pylon-snes.png', crop: true, card: 'item 1227' }
];
const BEGIN = '// BEGIN pixellab embeds';
const END = '// END pixellab embeds';

/** One 8-bit channel through the SNES's five bits and back. */
export function snap5(v) {
  const v5 = Math.round(v * 31 / 255);
  return (v5 << 3) | (v5 >> 2);
}

/** An { width, height, rgba } image in SNES colour, with one-bit transparency. */
export function toSnes(img) {
  const rgba = Buffer.from(img.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) { rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0; continue; }
    rgba[i] = snap5(rgba[i]);
    rgba[i + 1] = snap5(rgba[i + 1]);
    rgba[i + 2] = snap5(rgba[i + 2]);
    rgba[i + 3] = 255;
  }
  return { width: img.width, height: img.height, rgba };
}

/** The smallest rectangle of an image holding every drawn pixel. */
export function cropToOpaque(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!img.rgba[(y * img.width + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return img;
  const width = x1 - x0 + 1, height = y1 - y0 + 1, rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    img.rgba.copy(rgba, y * width * 4, ((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x1 + 1) * 4);
  }
  return { width, height, rgba };
}

/** The era file with its embed block rewritten, keeping the file's own line endings. */
export function embed(src, art) {
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error('no pixellab embed markers in the era file');
  const from = src.indexOf(eol, a) + eol.length;
  const to = src.lastIndexOf(eol, b) + eol.length;
  const lines = PIECES.map((p, i) =>
    `    ${p.key}: 'data:image/png;base64,${art[p.key].toString('base64')}'${i < PIECES.length - 1 ? ',' : ''}`);
  const block = ['  var ART = {'].concat(lines, ['  };', '']).join(eol);
  return src.slice(0, from) + block + src.slice(to);
}

/**
 * The manifest with one derived entry per piece, replacing any earlier one of
 * the same name: the source's prompt, seed and request, a cost of nothing, and
 * where the picture came from and how.
 */
export function withEntries(manifest, made) {
  const out = JSON.parse(JSON.stringify(manifest));
  for (const m of made) {
    const src = out.images.find((e) => e.file === m.from);
    if (!src) throw new Error(`no manifest entry for ${m.from}`);
    const entry = Object.assign({}, src, {
      name: m.to.replace(/\.png$/, ''), file: m.to,
      cost: { type: 'derived', generations: 0 },
      derivedFrom: m.from,
      derivedBy: 'node assets/pixellab/era4-snes-embed.mjs',
      how: `every colour snapped to the Super Nintendo's 15-bit colour (five bits a channel), alpha cut at half so a pixel is drawn or not${m.crop ? ', cropped to the pixels it draws' : ''}; ${m.colours} colours`,
      card: m.card || 'item 1180',
      verdict: 'drawn by era 4 (src/eras/era4-snes.js, embedded there as a data: URI)',
      pixels: { width: m.width, height: m.height },
      bytes: m.bytes,
      sha256: m.sha256
    });
    delete entry.generationsUsed;
    delete entry.seconds;
    const at = out.images.findIndex((e) => e.name === entry.name);
    if (at >= 0) out.images[at] = entry;
    else out.images.push(entry);
  }
  return out;
}

export function main(log = console.log) {
  const art = {}, made = [];
  for (const p of PIECES) {
    let img = toSnes(decodePng(fs.readFileSync(path.join(HERE, p.from))));
    if (p.crop) img = cropToOpaque(img);
    art[p.key] = encodePng(img.width, img.height, img.rgba);
    fs.writeFileSync(path.join(HERE, p.to), art[p.key]);
    const colours = new Set();
    for (let i = 0; i < img.rgba.length; i += 4) if (img.rgba[i + 3]) colours.add(img.rgba.readUInt32BE(i));
    made.push({ from: p.from, to: p.to, crop: !!p.crop, card: p.card, width: img.width, height: img.height, colours: colours.size,
      bytes: art[p.key].length, sha256: crypto.createHash('sha256').update(art[p.key]).digest('hex') });
    log(`${p.to} ${img.width}x${img.height}, ${art[p.key].length} bytes, ${colours.size} SNES colours`);
  }
  fs.writeFileSync(ERA_FILE, embed(fs.readFileSync(ERA_FILE, 'utf8'), art));
  const mpath = path.join(HERE, 'manifest.json');
  const raw = fs.readFileSync(mpath, 'utf8');
  fs.writeFileSync(mpath, JSON.stringify(withEntries(JSON.parse(raw), made), null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  log(`embedded all ${PIECES.length} in ${path.relative(process.cwd(), ERA_FILE)}; manifest entries written`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
