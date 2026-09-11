#!/usr/bin/env node
/*
 * assets/pixellab/era9-derive.mjs -- era 9's two player sheets, cut from what
 * pixellab.ai actually drew (item 1233). Costs no generations: it only reads
 * the raw images tools/pixellab.mjs saved and writes derived files.
 *
 *   node assets/pixellab/era9-derive.mjs            # write the sheets
 *   node assets/pixellab/era9-derive.mjs --blobs    # only list the figures found
 *
 * The art bible (docs/ART.md, era 9, ASSETS) asked pixflux for each player as
 * a whole 3 x 6 sheet of 24 x 54 frames. It did not keep the grid: the marine
 * came back as 13 figures in 7 rows of two, on an opaque black ground, and the
 * cyborg as four figures of two different sizes. So the figures are found
 * here instead -- the black ground keyed out by a flood fill from the border,
 * then every 8-connected group of what is left -- and each beat's frame is
 * picked from them by index (PICK below, chosen by looking at the raw sheet),
 * optionally mirrored, and pasted into a fresh sheet on the rig's grid:
 * rows idle, up, down, swing, miss, win; columns 2, 2, 2, 3, 1, 2; feet on
 * the frame's bottom edge, the figure's front (its right, facing the ball)
 * against the frame's right edge where the rig puts the hand.
 *
 * Output: tex3d-era9-armour-left.png and tex3d-era9-armour-right.png beside
 * this file, which assets/pixellab/tex3d-embed.mjs folds into src/textures3d.js
 * as data: URIs (the 3D eras' images never taint the canvas), and
 * era9-armour-left.png / era9-armour-right.png rewritten to the same pixels,
 * so the rig's file load (src/sprites.js) and the embedded copy are one image.
 * The raw pixflux images are kept as era9-armour-*-raw.png.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './era2-nes-quantize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const FRAME = { w: 40, h: 50 };
export const ROWS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
export const COLS = { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 };
export const BG_MAX = 26;          // a border-connected pixel this dark on every channel is ground

// Which found figure plays each frame: [index, mirrored]. Indices are the
// figures in reading order (top to bottom, then left to right) -- `--blobs`
// prints them.
export const PICK = {
  left: {
    idle: [[0, false], [2, false]],
    up: [[3, false], [4, false]],
    down: [[6, false], [8, false]],
    swing: [[1, false], [7, false], [12, true]],
    miss: [[5, true]],
    win: [[10, false], [11, false]]
  },
  right: null   // set in main() from what the cyborg sheet holds
};

export function keyGround(img) {
  const { width: w, height: h, rgba } = img;
  const out = Buffer.from(rgba);
  const dark = (i) => rgba[i * 4] <= BG_MAX && rgba[i * 4 + 1] <= BG_MAX && rgba[i * 4 + 2] <= BG_MAX;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !dark(i)) continue;
    seen[i] = 1;
    out[i * 4 + 3] = 0;
    const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return { width: w, height: h, rgba: out };
}

export function blobs(img, minPx = 40) {
  const { width: w, height: h, rgba } = img;
  const label = new Int32Array(w * h).fill(-1);
  const found = [];
  for (let s = 0; s < w * h; s++) {
    if (label[s] >= 0 || rgba[s * 4 + 3] === 0) continue;
    const box = { x0: w, y0: h, x1: -1, y1: -1, n: 0, id: found.length };
    const stack = [s];
    label[s] = box.id;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i - x) / w;
      box.n++;
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (label[j] < 0 && rgba[j * 4 + 3] !== 0) { label[j] = box.id; stack.push(j); }
        }
      }
    }
    found.push(box);
  }
  // Small specks join the figure whose box they sit in, else are dropped.
  const big = found.filter((b) => b.n >= minPx);
  for (const b of found) {
    if (b.n >= minPx) continue;
    const host = big.find((f) => b.x0 >= f.x0 - 2 && b.x1 <= f.x1 + 2 && b.y0 >= f.y0 - 2 && b.y1 <= f.y1 + 2);
    if (host) {
      host.x0 = Math.min(host.x0, b.x0); host.x1 = Math.max(host.x1, b.x1);
      host.y0 = Math.min(host.y0, b.y0); host.y1 = Math.max(host.y1, b.y1);
      host.members = (host.members || []).concat(b.id);
    }
  }
  for (const f of big) f.members = [f.id].concat(f.members || []);
  // Reading order: a row is figures whose vertical middles are within 12 px.
  big.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const rows = [];
  for (const f of big) {
    const mid = (f.y0 + f.y1) / 2;
    const row = rows.find((r) => Math.abs(r.mid - mid) < 12);
    if (row) row.list.push(f); else rows.push({ mid, list: [f] });
  }
  const ordered = [];
  for (const r of rows) ordered.push(...r.list.sort((a, b) => a.x0 - b.x0));
  return { label, list: ordered };
}

/** Paste one figure into sheet at frame (col, row): feet on the bottom, its right edge on the frame's right. */
export function paste(sheet, img, found, fig, col, row, mirror) {
  const fw = fig.x1 - fig.x0 + 1, fh = fig.y1 - fig.y0 + 1;
  const k = Math.min(1, FRAME.w / fw, FRAME.h / fh);   // only ever shrunk to fit, never grown
  const ow = Math.round(fw * k), oh = Math.round(fh * k);
  const ox = col * FRAME.w + (FRAME.w - ow), oy = row * FRAME.h + (FRAME.h - oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let sx = Math.min(fw - 1, Math.floor(x / k));
      const sy = Math.min(fh - 1, Math.floor(y / k));
      if (mirror) sx = fw - 1 - sx;
      const si = (fig.y0 + sy) * img.width + fig.x0 + sx;
      if (!fig.members.includes(found.label[si])) continue;
      const di = ((oy + y) * sheet.width + ox + x) * 4;
      img.rgba.copy(sheet.rgba, di, si * 4, si * 4 + 4);
    }
  }
}

export function build(img, found, pick) {
  const cols = Math.max(...ROWS.map((r) => COLS[r]));
  const sheet = { width: FRAME.w * cols, height: FRAME.h * ROWS.length };
  sheet.rgba = Buffer.alloc(sheet.width * sheet.height * 4);
  ROWS.forEach((beat, row) => {
    (pick[beat] || []).forEach(([index, mirror], col) => {
      const fig = found.list[index];
      if (fig) paste(sheet, img, found, fig, col, row, mirror);
    });
  });
  return sheet;
}

function rawOf(name) {
  const raw = path.join(HERE, name + '-raw.png');
  const plain = path.join(HERE, name + '.png');
  if (!fs.existsSync(raw)) fs.copyFileSync(plain, raw);
  return decodePng(fs.readFileSync(raw));
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const listOnly = argv.includes('--blobs');
  const sides = { left: 'era9-armour-left', right: 'era9-armour-right' };
  for (const side of Object.keys(sides)) {
    const name = sides[side];
    const img = keyGround(rawOf(name));
    const found = blobs(img);
    log(`${name}: ${found.list.length} figures`);
    found.list.forEach((f, i) => log(`  ${i}: x ${f.x0}-${f.x1}, y ${f.y0}-${f.y1} (${f.x1 - f.x0 + 1} x ${f.y1 - f.y0 + 1}, ${f.n} px)`));
    if (listOnly) continue;
    const pick = PICK[side] || rightPick(found);
    const sheet = build(img, found, pick);
    const png = encodePng(sheet.width, sheet.height, sheet.rgba);
    fs.writeFileSync(path.join(HERE, 'tex3d-' + name + '.png'), png);
    fs.writeFileSync(path.join(HERE, name + '.png'), png);
    log(`  wrote ${name}.png and tex3d-${name}.png (${sheet.width} x ${sheet.height})`);
  }
}

/** The cyborg: whatever figures came back, spread over the beats. */
export function rightPick(found) {
  const n = found.list.length;
  const at = (i) => [Math.min(n - 1, i), false];
  return {
    idle: [at(0), at(1)], up: [at(2), at(3)], down: [at(3), at(2)],
    swing: [at(0), at(4), at(4)], miss: [at(1)], win: [at(5), at(5)]
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
