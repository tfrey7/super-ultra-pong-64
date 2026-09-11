#!/usr/bin/env node
/*
 * assets/pixellab/era5-fighters-cut.mjs -- the PlayStation fighters' sheets,
 * cut to the players' rig (item 1228). Costs no generation: it only rearranges
 * pixels pixellab already drew.
 *
 * The art bible (docs/ART.md, era 5 ASSETS) asks pixflux for each fighter as a
 * whole 3 x 6 sheet of 20 x 45 frames. It does not draw to a grid: asked for
 * one, `era5-fighter-left` came back as about thirty red fighters of 13-17 x
 * 26-28 pixels in ten loose rows, some with black hair and some blond, and
 * `era5-fighter-right` as fifteen blue fighters of 12-14 x 24 in two uneven
 * columns. So this script finds every figure in a raw sheet (8-connected
 * opaque pixels, specks merged into the figure they touch), and packs the ones
 * PICK names into a clean sheet in the rig's order -- idle 2, up 2, down 2,
 * swing 3, miss 1, win 2 -- one figure a FRAME, feet on the frame's bottom row,
 * its front (the side facing the ball) on the frame's right-hand edge, so the
 * rig's `hand` is one fixed pixel for every frame.
 *
 *   node assets/pixellab/era5-fighters-cut.mjs --list   what figures each raw sheet holds
 *   node assets/pixellab/era5-fighters-cut.mjs          writes era5-left.png, era5-right.png
 *
 * Deterministic; no dependencies (the PNG reader and writer are era 2's).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './era2-nes-quantize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FRAME = { w: 20, h: 30 };
export const BEATS = [['idle', 2], ['up', 2], ['down', 2], ['swing', 3], ['miss', 1], ['win', 2]];

// Which figure (its index in --list order: top to bottom, then left to right)
// plays each frame. Picked by eye from the raw sheets: the left fighter keeps
// to the black-haired figures so the frames agree with one another.
export const PICK = {
  left: {
    raw: 'era5-fighter-left', out: 'era5-left',
    idle: [3, 6], up: [4, 9], down: [5, 11], swing: [12, 13, 14], miss: [8], win: [15, 17]
  },
  right: {
    raw: 'era5-fighter-right', out: 'era5-right',
    idle: [0, 2], up: [3, 4], down: [4, 3], swing: [6, 9, 7], miss: [5], win: [8, 10]
  }
};

/** Every figure in an image: [{ x0, y0, x1, y1, pixels }] in reading order. */
export function figures(img) {
  const { width: W, height: H, rgba } = img;
  const seen = new Uint8Array(W * H);
  const out = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || rgba[s * 4 + 3] < 128) continue;
    const stack = [s];
    seen[s] = 1;
    const f = { x0: W, y0: H, x1: -1, y1: -1, pixels: [] };
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      f.pixels.push(i);
      if (x < f.x0) f.x0 = x; if (x > f.x1) f.x1 = x;
      if (y < f.y0) f.y0 = y; if (y > f.y1) f.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!seen[j] && rgba[j * 4 + 3] >= 128) { seen[j] = 1; stack.push(j); }
      }
    }
    out.push(f);
  }
  // Specks (a loose fist, a stray foot) join the big figure whose box they touch.
  const big = out.filter((f) => f.pixels.length >= 40);
  for (const f of out) {
    if (f.pixels.length >= 40) continue;
    const home = big.find((b) => f.x0 <= b.x1 + 2 && f.x1 >= b.x0 - 2 && f.y0 <= b.y1 + 2 && f.y1 >= b.y0 - 2);
    if (!home) continue;
    home.pixels.push(...f.pixels);
    home.x0 = Math.min(home.x0, f.x0); home.x1 = Math.max(home.x1, f.x1);
    home.y0 = Math.min(home.y0, f.y0); home.y1 = Math.max(home.y1, f.y1);
  }
  // Reading order: rows by the figure's middle, 12 pixels a band.
  big.sort((a, b) => (Math.round((a.y0 + a.y1) / 24) - Math.round((b.y0 + b.y1) / 24)) || (a.x0 - b.x0));
  return big;
}

/** One figure into frame (col, row) of the sheet: feet on the bottom row, front on the right edge. */
function place(sheet, SW, img, f, col, row) {
  const w = f.x1 - f.x0 + 1, h = f.y1 - f.y0 + 1;
  const ox = col * FRAME.w + Math.max(0, FRAME.w - w), oy = row * FRAME.h + Math.max(0, FRAME.h - h);
  for (const i of f.pixels) {
    const x = (i % img.width) - f.x0, y = ((i / img.width) | 0) - f.y0;
    if (x >= FRAME.w || y >= FRAME.h) continue;
    img.rgba.copy(sheet, ((oy + y) * SW + ox + x) * 4, i * 4, i * 4 + 4);
  }
}

export function cut(side, log = console.log) {
  const p = PICK[side];
  const img = decodePng(fs.readFileSync(path.join(HERE, p.raw + '.png')));
  const figs = figures(img);
  const cols = Math.max(...BEATS.map((b) => b[1]));
  const SW = FRAME.w * cols, SH = FRAME.h * BEATS.length;
  const sheet = Buffer.alloc(SW * SH * 4);
  BEATS.forEach(([beat, n], row) => {
    for (let i = 0; i < n; i++) {
      const f = figs[p[beat][i]];
      if (!f) throw new Error(`${side}: no figure ${p[beat][i]} for ${beat} (the raw sheet holds ${figs.length})`);
      place(sheet, SW, img, f, i, row);
    }
  });
  fs.writeFileSync(path.join(HERE, p.out + '.png'), encodePng(SW, SH, sheet));
  log(`${p.out}.png: ${SW} x ${SH}, ${figs.length} figures found in ${p.raw}.png`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--list')) {
    for (const side of Object.keys(PICK)) {
      const img = decodePng(fs.readFileSync(path.join(HERE, PICK[side].raw + '.png')));
      figures(img).forEach((f, i) => console.log(side, i, `x ${f.x0}-${f.x1} y ${f.y0}-${f.y1}`,
        `${f.x1 - f.x0 + 1}x${f.y1 - f.y0 + 1}`, f.pixels.length + 'px'));
    }
  } else {
    for (const side of Object.keys(PICK)) cut(side);
  }
}
