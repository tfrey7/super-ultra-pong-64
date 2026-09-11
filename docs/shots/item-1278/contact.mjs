/*
 * item 1278: era 1's players, before and after, cropped to the sprites.
 *
 *   node docs/shots/item-1278/contact.mjs [--scale 8 --out look.png]
 *
 * Writes contact.png beside itself: for each side, the frames the game drew
 * before item 1278 (before-<side>.png, the item 1224 sheet in ink 2, taken
 * from master) and the frames drawn now (built from the text grids by
 * tools/spritegen.mjs), each frame on its own with a gap, labelled by beat,
 * at game scale (5: one sheet pixel is one native 2600 pixel, 5 field units)
 * and at 4x. With --scale N it writes one strip of the new frames at N only.
 *
 * Reading contact.png: a grey bar at the left of a row is the old frames, an
 * ink bar the new; rows go player old, player new, computer old, computer new;
 * the top block is game scale (5), the bottom 4x. Frames run idle 0-1, up 0-1,
 * down 0-1, swing 0-2, miss, win 0-1, a wider gap between beats.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode } from '../../../tools/palette-snap.mjs';
import * as SG from '../../../tools/spritegen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FW = 6, FH = 28;
const ORDER = ['idle0', 'idle1', 'up0', 'up1', 'down0', 'down1', 'swing0', 'swing1', 'swing2', 'miss0', 'win0', 'win1'];
const BG = [22, 22, 28], PANEL = [0, 0, 0], INK = [0xc8, 0xcc, 0x30];

function framesFromSheet(img) {
  const out = {};
  for (const name of ORDER) {
    const beat = name.replace(/\d$/, ''), i = +name.slice(-1);
    const row = SG.BEATS.indexOf(beat);
    out[name] = Array.from({ length: FH }, (_, y) => Array.from({ length: FW }, (_, x) => {
      const at = (((row * FH + y) * img.width) + i * FW + x) * 4;
      return img.rgba[at + 3] >= 128 ? [img.rgba[at], img.rgba[at + 1], img.rgba[at + 2]] : null;
    }));
  }
  return out;
}
function framesFromGrid(file) {
  const doc = SG.load(file);
  const g = SG.resolve(doc);
  const out = {};
  for (const n of ORDER) out[n] = g[n].map((r) => r.map((c) => (c === '.' ? null : INK)));
  return out;
}

// a canvas of rgb, and a 3x5 digit/letter-free label: a tick row under each beat group
function canvas(w, h) { const b = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { b[i * 4] = BG[0]; b[i * 4 + 1] = BG[1]; b[i * 4 + 2] = BG[2]; b[i * 4 + 3] = 255; } return { width: w, height: h, rgba: b }; }
function rect(img, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const at = (y * img.width + x) * 4; img.rgba[at] = c[0]; img.rgba[at + 1] = c[1]; img.rgba[at + 2] = c[2];
  }
}
function strip(img, frames, k, ox, oy) {
  const gap = 3 * k;
  let x = ox;
  ORDER.forEach((n, idx) => {
    if (idx && ORDER[idx - 1].replace(/\d$/, '') !== n.replace(/\d$/, '')) x += gap;   // a wider gap between beats
    rect(img, x - k, oy - k, (FW + 2) * k, (FH + 2) * k, PANEL);
    frames[n].forEach((row, y) => row.forEach((c, xx) => { if (c) rect(img, x + xx * k, oy + y * k, k, k, c); }));
    x += (FW + 2) * k + k;
  });
  return x;
}
function stripWidth(k) { return 12 * ((FW + 2) * k + k) + 5 * 3 * k; }

const argv = process.argv.slice(2);
const only = argv.indexOf('--scale');
if (only >= 0) {
  const k = +argv[only + 1];
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(HERE, 'look.png');
  const img = canvas(stripWidth(k) + 4 * k, 2 * (FH + 6) * k);
  strip(img, framesFromGrid(path.join(HERE, '../../../assets/spritegen/era1-left.json')), k, 2 * k, 2 * k);
  strip(img, framesFromGrid(path.join(HERE, '../../../assets/spritegen/era1-right.json')), k, 2 * k, (FH + 6) * k + 2 * k);
  fs.writeFileSync(out, encode(img));
  console.log('LOOK', out);
} else {
  // rows: left before, left after, right before, right after; at 5 then at 4
  const scales = [5, 4];
  const rowH = (k) => (FH + 5) * k;
  const W = stripWidth(5) + 40;
  const H = scales.reduce((s, k) => s + 4 * rowH(k) + 30, 0) + 20;
  const img = canvas(W, H);
  let y = 20;
  for (const k of scales) {
    for (const side of ['left', 'right']) {
      const before = framesFromSheet(decode(fs.readFileSync(path.join(HERE, `before-${side}.png`))));
      const after = framesFromGrid(path.join(HERE, `../../../assets/spritegen/era1-${side}.json`));
      rect(img, 4, y + k, 6, FH * k, [120, 120, 130]);            // grey bar: before
      strip(img, before, k, 20, y + k); y += rowH(k);
      rect(img, 4, y + k, 6, FH * k, INK);                          // ink bar: after
      strip(img, after, k, 20, y + k); y += rowH(k);
    }
    y += 30;
  }
  const out = path.join(HERE, 'contact.png');
  fs.writeFileSync(out, encode(img));
  console.log('CONTACT', out, img.width + ' x ' + img.height);
}
