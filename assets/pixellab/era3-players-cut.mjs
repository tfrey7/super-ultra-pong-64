#!/usr/bin/env node
/*
 * assets/pixellab/era3-players-cut.mjs -- the Genesis players' sheets, re-cut
 * offline from what pixflux returned (item 1226; 0 generations).
 *
 * Asked for "3 columns by 6 rows" at 36 x 312, pixflux drew each warrior as ONE
 * column of eleven small figures stacked top to bottom -- 9 to 20 wide and 19
 * to 25 tall, not the 12 x 52 frames the bible's grid wanted. This script finds
 * the figures (runs of opaque rows), takes them in order as the frames of the
 * six beats in the prompt's order (idle, up, down, swing, miss, win), and packs each into a frame
 * of one fixed size, feet on the frame's floor and the shield's outer edge on
 * the frame's right edge -- which is where the rig puts the hand. The swing's
 * third frame repeats its first (the recoil back to guard). Every pixel is then
 * snapped to the Genesis's 512 colours (3 bits a channel).
 *
 *   node assets/pixellab/era3-players-cut.mjs            writes era3-p1.png, era3-p2.png
 *   node assets/pixellab/era3-players-cut.mjs --report   prints the figures it found
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode, snapImage } from '../../tools/palette-snap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JOBS = [
  { from: 'era3-players-left.png', to: 'era3-p1.png' },
  { from: 'era3-players-right.png', to: 'era3-p2.png' }
];
export const BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
export const FRAMES = { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 };
const ALPHA = 128;

function opaque(img, x, y) { return img.rgba[(y * img.width + x) * 4 + 3] >= ALPHA; }

/** The figures in a one-column strip: [{ x, y, w, h }], top to bottom. */
export function figures(img) {
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let any = false;
    for (let x = 0; x < img.width && !any; x++) any = opaque(img, x, y);
    rows.push(any);
  }
  const out = [];
  let y = 0;
  while (y < img.height) {
    if (!rows[y]) { y++; continue; }
    const y0 = y;
    while (y < img.height && rows[y]) y++;
    let x0 = img.width, x1 = -1;
    for (let yy = y0; yy < y; yy++) {
      for (let x = 0; x < img.width; x++) {
        if (opaque(img, x, yy)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      }
    }
    if (y - y0 >= 6) out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y - y0 });
  }
  return out;
}

/** Pack twelve figures into a 3 x 6 sheet of frame w x h, feet down, right-aligned. */
export function pack(img, figs, w, h) {
  const cols = 3;
  const sheet = { width: w * cols, height: h * BEATS.length, rgba: new Uint8Array(w * cols * h * BEATS.length * 4) };
  const put = (f, col, row) => {
    const ox = col * w + (w - Math.min(w, f.w));
    const oy = row * h + (h - Math.min(h, f.h));
    for (let y = 0; y < Math.min(h, f.h); y++) {
      for (let x = 0; x < Math.min(w, f.w); x++) {
        const sx = f.x + (f.w - Math.min(w, f.w)) + x;
        const sy = f.y + (f.h - Math.min(h, f.h)) + y;
        const s = (sy * img.width + sx) * 4;
        const d = ((oy + y) * sheet.width + ox + x) * 4;
        for (let k = 0; k < 4; k++) sheet.rgba[d + k] = img.rgba[s + k];
      }
    }
  };
  // Figures are taken in order, one per frame, and the swing's third frame
  // repeats its first: 2 + 2 + 2 + 2 + 1 + 2 = 11, which is what came back.
  let next = 0;
  const take = () => figs[Math.min(figs.length - 1, next++)];
  BEATS.forEach((beat, row) => {
    const a = take();
    const list = FRAMES[beat] === 1 ? [a] : FRAMES[beat] === 3 ? [a, take(), a] : [a, take()];
    list.forEach((f, col) => put(f, col, row));
  });
  return sheet;
}

export function main(argv) {
  const report = argv.includes('--report');
  const cut = [];
  for (const job of JOBS) {
    const img = decode(fs.readFileSync(path.join(HERE, job.from)));
    const figs = figures(img);
    cut.push({ job, img, figs });
    if (report) console.log(job.from, img.width + 'x' + img.height, figs.length, 'figures', JSON.stringify(figs));
  }
  if (report) return;
  // One frame size for both players, so the rig's one frame/hand fits both.
  let w = 0, h = 0;
  for (const c of cut) for (const f of c.figs) { w = Math.max(w, f.w); h = Math.max(h, f.h); }
  for (const c of cut) {
    const sheet = snapImage(pack(c.img, c.figs, w, h), 3, ALPHA);
    fs.writeFileSync(path.join(HERE, c.job.to), encode(sheet));
    console.log(c.job.to, sheet.width + 'x' + sheet.height, 'frame', w + 'x' + h, 'from', c.figs.length, 'figures');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
