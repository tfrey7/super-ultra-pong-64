#!/usr/bin/env node
/*
 * assets/pixellab/era9-derive.mjs -- era 9's two player sheets, cut from what
 * pixellab.ai actually drew (item 1233). Costs no generations: it only reads
 * the raw images tools/pixellab.mjs saved and writes derived files.
 *
 *   node assets/pixellab/era9-derive.mjs
 *
 * The art bible (docs/ART.md, era 9, ASSETS) asked pixflux for each player as
 * a whole 3 x 6 sheet of 24 x 54 frames. It did not keep that grid:
 *
 *   - the marine (era9-armour-left-raw.png, 72 x 324) came back as 13
 *     figures in 7 rows of two, about 27 x 42 each, on an opaque ground;
 *   - the cyborg (era9-armour-right-raw.png) as four figures of two different
 *     sizes, no grid at all -- so it was asked for again from the re-roll
 *     reserve as ONE row of three 24 x 54 frames (era9-armour-right-row.png),
 *     which pixflux did keep, though the three poses barely differ.
 *
 * So each figure is cut from its cell of the layout pixflux did draw (CELLS),
 * the ground keyed out (the pixel colour the border is painted in, flood
 * filled from the edge, so the black outline, a different near-black, stays),
 * and pasted into a fresh sheet on the rig's grid -- rows idle, up, down,
 * swing, miss, win; columns 2, 2, 2, 3, 1, 2 -- with its feet on the frame's
 * bottom edge and its front (facing the ball) against the frame's right edge,
 * where the rig puts the hand. PICK says which cell plays each frame, chosen
 * by looking at the raw sheets; `lean` slides a frame's figure toward (+) or
 * away from (-) the ball by whole pixels, which is how the cyborg's three
 * near-identical stances are made into a swing and a recoil.
 *
 * Output: era9-armour-left.png and era9-armour-right.png, 28 x 54 frames on
 * 84 x 324 sheets, the names era 9's block in src/characters.js gives (the
 * rig loads a sheet by name, off disk, through src/sprites.js); and the set
 * dressing as tex3d-era9-beacon.png (ground keyed) and tex3d-era9-hangar.png,
 * which assets/pixellab/tex3d-embed.mjs folds into src/textures3d.js as data:
 * URIs for the era file to draw. Node 18+, no dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './era2-nes-quantize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const FRAME = { w: 28, h: 54 };
export const ROWS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
export const COLS = { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 };
export const KEY_TOL = 2;          // a border-connected pixel this close to the border's colour is ground

// The layout pixflux drew: column edges and row edges, in raw pixels.
export const CELLS = {
  left: { raw: 'era9-armour-left-raw', xs: [0, 38, 72], ys: [0, 55, 100, 146, 189, 232, 276, 324] },
  right: { raw: 'era9-armour-right-row', xs: [0, 24, 48, 72], ys: [0, 54] }
};

// Which cell plays each frame: { c: column, r: row, flip, lean }.
export const PICK = {
  left: {
    idle: [{ c: 0, r: 0 }, { c: 0, r: 1 }],
    up: [{ c: 1, r: 1 }, { c: 0, r: 2 }],
    down: [{ c: 0, r: 3 }, { c: 1, r: 4 }],
    swing: [{ c: 1, r: 0 }, { c: 0, r: 6, flip: true }, { c: 1, r: 0 }],
    miss: [{ c: 1, r: 2, lean: -2 }],
    win: [{ c: 0, r: 4 }, { c: 1, r: 5 }]
  },
  right: {
    idle: [{ c: 0, r: 0 }, { c: 1, r: 0 }],
    up: [{ c: 1, r: 0, lean: 1 }, { c: 2, r: 0, lean: 1 }],
    down: [{ c: 2, r: 0, lean: -1 }, { c: 1, r: 0, lean: -1 }],
    swing: [{ c: 0, r: 0, lean: -1 }, { c: 2, r: 0, lean: 3 }, { c: 2, r: 0, lean: 1 }],
    miss: [{ c: 0, r: 0, lean: -3 }],
    win: [{ c: 2, r: 0 }, { c: 2, r: 0, lean: 1 }]
  }
};

/** The ground keyed out: the border's colour, flood filled from the edge. */
export function keyGround(img) {
  const { width: w, height: h, rgba } = img;
  const out = Buffer.from(rgba);
  const g = [rgba[0], rgba[1], rgba[2]];
  const ground = (i) => Math.abs(rgba[i * 4] - g[0]) <= KEY_TOL && Math.abs(rgba[i * 4 + 1] - g[1]) <= KEY_TOL &&
    Math.abs(rgba[i * 4 + 2] - g[2]) <= KEY_TOL;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !ground(i)) continue;
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

/** The opaque bounding box inside one cell, or null. */
export function cellBox(img, x0, y0, x1, y1) {
  let bx0 = x1, by0 = y1, bx1 = -1, by1 = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (img.rgba[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
  }
  return bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 };
}

/** Paste one cell's figure into frame (col, row): feet on the bottom, its front on the right edge. */
export function paste(sheet, img, box, col, row, flip, lean) {
  const fw = box.x1 - box.x0 + 1, fh = box.y1 - box.y0 + 1;
  const ox = col * FRAME.w + (FRAME.w - fw) + (lean || 0), oy = row * FRAME.h + (FRAME.h - fh);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const dx = ox + x, dy = oy + y;
      if (dx < col * FRAME.w || dx >= (col + 1) * FRAME.w || dy < row * FRAME.h) continue;
      const sx = box.x0 + (flip ? fw - 1 - x : x), sy = box.y0 + y;
      const si = (sy * img.width + sx) * 4;
      if (img.rgba[si + 3] === 0) continue;
      img.rgba.copy(sheet.rgba, (dy * sheet.width + dx) * 4, si, si + 4);
    }
  }
}

export function build(img, cells, pick) {
  const cols = Math.max(...ROWS.map((r) => COLS[r]));
  const sheet = { width: FRAME.w * cols, height: FRAME.h * ROWS.length };
  sheet.rgba = Buffer.alloc(sheet.width * sheet.height * 4);
  ROWS.forEach((beat, row) => {
    (pick[beat] || []).forEach((p, col) => {
      const box = cellBox(img, cells.xs[p.c], cells.ys[p.r], cells.xs[p.c + 1], cells.ys[p.r + 1]);
      if (box) paste(sheet, img, box, col, row, p.flip, p.lean);
    });
  });
  return sheet;
}

export function main(log = console.log) {
  for (const side of ['left', 'right']) {
    const cells = CELLS[side];
    const name = 'era9-armour-' + side;
    const img = keyGround(decodePng(fs.readFileSync(path.join(HERE, cells.raw + '.png'))));
    const sheet = build(img, cells, PICK[side]);
    const png = encodePng(sheet.width, sheet.height, sheet.rgba);
    fs.writeFileSync(path.join(HERE, name + '.png'), png);
    log(`wrote ${name}.png (${sheet.width} x ${sheet.height}, frames ${FRAME.w} x ${FRAME.h})`);
  }
  // The set dressing: the beacon's ground keyed out, the hangar plate as it came.
  const beacon = keyGround(decodePng(fs.readFileSync(path.join(HERE, 'era9-beacon.png'))));
  fs.writeFileSync(path.join(HERE, 'tex3d-era9-beacon.png'), encodePng(beacon.width, beacon.height, beacon.rgba));
  fs.copyFileSync(path.join(HERE, 'era9-hangar.png'), path.join(HERE, 'tex3d-era9-hangar.png'));
  log('wrote tex3d-era9-beacon.png (ground keyed) and tex3d-era9-hangar.png');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
