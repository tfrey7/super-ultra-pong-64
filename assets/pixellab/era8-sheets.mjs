#!/usr/bin/env node
/*
 * assets/pixellab/era8-sheets.mjs -- era 8's two operatives, re-cut into the
 * players' rig shape (item 1232). Derived files: 0 generations.
 *
 *   node assets/pixellab/era8-sheets.mjs
 *
 * pixflux was asked for "a 3 x 6 sprite sheet" at 72 x 324 (docs/ART.md, era 8
 * ASSETS) and did not draw one: era8-suit-left came back as 8 figures in a
 * 2 x 4 grid, era8-suit-right as 3 figures in one column, at two different
 * heights. So this script finds each figure by its alpha, scales it to one
 * height (nearest neighbour), stands it on one baseline with its legs at one x,
 * and lays the figures out as the rig wants them -- one row per beat in the
 * order idle, up, down, swing, miss, win, three columns -- deriving the poses
 * pixflux did not give:
 *
 *   idle       one standing figure, the second frame a pixel lower (a breath)
 *   up / down  a standing figure leaned into the run (a pixel shear, top
 *              forward for up, back for down)
 *   swing      the shield figure, the middle frame shoved 3 pixels forward
 *   miss       a standing figure mirrored: the head turned to follow the
 *              ball out behind it
 *   win        the raised-arm figure, the second frame 2 pixels up
 *
 * It also bakes the era's grade into the sheet (docs/ART.md, era 8 TREATMENT):
 * every colour mixed 12% toward the era's navy, and nothing brighter than
 * luma 0.8, so the visor is the brightest thing on a figure and never white.
 *
 * It writes era8-sheet-left.png and era8-sheet-right.png (the rig's `sheets`),
 * and tex3d-era8-skyline.png, the skyline plate copied under the name
 * assets/pixellab/tex3d-embed.mjs embeds into src/textures3d.js as a data:
 * URI. Node 18+, no dependencies; the PNG codec is era 2's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './era2-nes-quantize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The rig's frame for era 8, in sheet pixels, and where the figure stands in it. */
export const FRAME = { w: 40, h: 84 };
export const FIGURE_H = 80;        // every figure scaled to this many pixels tall
export const LEGS_X = 18;          // the centre of the legs, from the frame's left
export const FEET_Y = 83;          // the last row the feet touch
export const HAND = { x: 32, y: 47 };   // hips height, just in front of the body
export const NAVY = [0x0b, 0x10, 0x20];
export const GRADE = 0.12;
export const LUMA_MAX = 0.8;

const BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];

function blank(w, h) { return { width: w, height: h, rgba: Buffer.alloc(w * h * 4) }; }

/** The runs of occupied columns or rows (alpha > 40) of a region. */
function runs(img, axis, x0, y0, x1, y1) {
  const out = [];
  let start = -1;
  const n = axis === 'x' ? x1 - x0 : y1 - y0;
  for (let i = 0; i <= n; i++) {
    let hit = false;
    if (i < n) {
      for (let j = 0; j < (axis === 'x' ? y1 - y0 : x1 - x0) && !hit; j++) {
        const x = axis === 'x' ? x0 + i : x0 + j, y = axis === 'x' ? y0 + j : y0 + i;
        if (img.rgba[(y * img.width + x) * 4 + 3] > 40) hit = true;
      }
    }
    if (hit && start < 0) start = i;
    if (!hit && start >= 0) { if (i - start > 6) out.push([start + (axis === 'x' ? x0 : y0), i + (axis === 'x' ? x0 : y0)]); start = -1; }
  }
  return out;
}

/** Every figure in a sheet, read left to right, top to bottom: { x, y, w, h } boxes. */
export function figures(img) {
  const boxes = [];
  for (const [ry0, ry1] of runs(img, 'y', 0, 0, img.width, img.height)) {
    for (const [cx0, cx1] of runs(img, 'x', 0, ry0, img.width, ry1)) {
      const rows = runs(img, 'y', cx0, ry0, cx1, ry1);
      const top = rows[0][0], bottom = rows[rows.length - 1][1];
      boxes.push({ x: cx0, y: top, w: cx1 - cx0, h: bottom - top });
    }
  }
  return boxes;
}

/** A box of img scaled (nearest) to `height` pixels tall: a new image. */
function scaled(img, box, height) {
  const k = height / box.h;
  const w = Math.max(1, Math.round(box.w * k));
  const out = blank(w, height);
  for (let y = 0; y < height; y++) {
    const sy = box.y + Math.min(box.h - 1, Math.floor(y / k));
    for (let x = 0; x < w; x++) {
      const sx = box.x + Math.min(box.w - 1, Math.floor(x / k));
      img.rgba.copy(out.rgba, (y * w + x) * 4, (sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4);
    }
  }
  return out;
}

/** Where a figure's legs are: the middle of its occupied columns over its bottom fifth. */
function legsOf(fig) {
  let lo = fig.width, hi = -1;
  for (let y = Math.floor(fig.height * 0.8); y < fig.height; y++) {
    for (let x = 0; x < fig.width; x++) {
      if (fig.rgba[(y * fig.width + x) * 4 + 3] > 40) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    }
  }
  return hi < 0 ? fig.width / 2 : (lo + hi + 1) / 2;
}

/**
 * Stamp a figure into the sheet at frame (col, row), legs at LEGS_X, feet on
 * FEET_Y. opts: dx, dy (pixels), lean (pixels the top moves, forward +), mirror.
 */
function stamp(sheet, fig, col, row, opts = {}) {
  const legs = legsOf(fig);
  const ox = col * FRAME.w, oy = row * FRAME.h;
  for (let y = 0; y < fig.height; y++) {
    const shear = Math.round((opts.lean || 0) * (1 - y / (fig.height - 1)));
    for (let x = 0; x < fig.width; x++) {
      const sx = opts.mirror ? fig.width - 1 - x : x;
      const s = (y * fig.width + sx) * 4;
      if (fig.rgba[s + 3] === 0) continue;
      const fx = Math.round(LEGS_X - (opts.mirror ? fig.width - legs : legs) + x + shear + (opts.dx || 0));
      const fy = FEET_Y - (fig.height - 1) + y + (opts.dy || 0);
      if (fx < 0 || fx >= FRAME.w || fy < 0 || fy >= FRAME.h) continue;
      fig.rgba.copy(sheet.rgba, ((oy + fy) * sheet.width + ox + fx) * 4, s, s + 4);
    }
  }
}

/** The era's grade: 12% toward navy, then no colour past LUMA_MAX. In place. */
export function grade(img) {
  for (let i = 0; i < img.width * img.height; i++) {
    const d = i * 4;
    if (!img.rgba[d + 3]) continue;
    let r = img.rgba[d] + (NAVY[0] - img.rgba[d]) * GRADE;
    let g = img.rgba[d + 1] + (NAVY[1] - img.rgba[d + 1]) * GRADE;
    let b = img.rgba[d + 2] + (NAVY[2] - img.rgba[d + 2]) * GRADE;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luma > LUMA_MAX) { const k = LUMA_MAX / luma; r *= k; g *= k; b *= k; }
    img.rgba[d] = Math.round(r); img.rgba[d + 1] = Math.round(g); img.rgba[d + 2] = Math.round(b);
  }
  return img;
}

/** The brightest luma of any opaque pixel, 0..1. */
export function brightest(img) {
  let top = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const d = i * 4;
    if (img.rgba[d + 3] < 128) continue;
    top = Math.max(top, (0.2126 * img.rgba[d] + 0.7152 * img.rgba[d + 1] + 0.0722 * img.rgba[d + 2]) / 255);
  }
  return top;
}

/**
 * Which figure each frame shows, by its index in figures() order, with the
 * derived pose's options. `stand` lists the standing figures, `shield` the one
 * with the shield, `cheer` the raised arm, `look` the one mirrored for a miss.
 */
export function layout(cast) {
  const s = cast.stand, a = s[0], b = s[1 % s.length];
  return {
    idle: [[a, {}], [a, { dy: 1 }]],   // one figure breathing: a 1-pixel bob
    up: [[a, { lean: 4 }], [b, { lean: 4, dy: -1 }]],
    down: [[b, { lean: -3 }], [a, { lean: -3, dy: -1 }]],
    swing: [[cast.shield[0], { dx: -1 }], [cast.shield[1 % cast.shield.length], { dx: 3, lean: 3 }], [cast.shield[0], { dx: 1 }]],
    miss: [[cast.look, { mirror: true, dy: 1 }]],
    win: [[cast.cheer, {}], [cast.cheer, { dy: -2 }]]
  };
}

// The cast of each generated sheet, by figure index (left: 2 x 4, right: 1 x 3).
export const CAST = {
  left: { stand: [0, 2], shield: [3, 7], cheer: 5, look: 1 },
  right: { stand: [0], shield: [1], cheer: 2, look: 0 }
};

export function build(src, cast) {
  const figs = figures(src).map((box) => scaled(src, box, FIGURE_H));
  const sheet = blank(FRAME.w * 3, FRAME.h * BEATS.length);
  const plan = layout(cast);
  BEATS.forEach((beat, row) => plan[beat].forEach(([idx, opts], col) => stamp(sheet, figs[idx], col, row, opts)));
  return grade(sheet);
}

export function main(log = console.log) {
  for (const side of ['left', 'right']) {
    const src = decodePng(fs.readFileSync(path.join(HERE, `era8-suit-${side}.png`)));
    const n = figures(src).length;
    const sheet = build(src, CAST[side]);
    const out = path.join(HERE, `era8-sheet-${side}.png`);
    fs.writeFileSync(out, encodePng(sheet.width, sheet.height, sheet.rgba));
    log(`wrote ${out}: ${sheet.width} x ${sheet.height} from ${n} figures, brightest luma ${brightest(sheet).toFixed(3)}`);
  }
  fs.copyFileSync(path.join(HERE, 'era8-skyline.png'), path.join(HERE, 'tex3d-era8-skyline.png'));
  log('copied era8-skyline.png to tex3d-era8-skyline.png (run tex3d-embed.mjs next)');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
