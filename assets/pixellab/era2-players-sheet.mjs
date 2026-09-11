#!/usr/bin/env node
/*
 * assets/pixellab/era2-players-sheet.mjs -- the NES players' six-row sheets
 * (item 1225), built offline from the art bible's era 2 silhouette. 0 generations.
 *
 *   node assets/pixellab/era2-players-sheet.mjs
 *
 * Why this exists: the bible asked pixflux for each player as one 30 x 264 sheet
 * (3 frames by 6 rows of 10 x 44). That was untried, and it failed: both sheets
 * came back almost empty -- a dozen stray pixels down a transparent strip
 * (era2-players-left.png, era2-players-right.png, kept as the record). A single
 * 32 x 64 standing pose (era2-player-left-pose.png, -right-pose.png) came back
 * good, but its figure is 28 pixels wide with the fists held out, and the room
 * behind a paddle is 10 NES pixels: squeezed to fit, the arms and face go to mush.
 * So the poses are the reference -- the red headband, the blue cap, the big
 * Super Mario Bros. head -- and the sheets are drawn here, pixel by pixel, from
 * the bible's proportions: head 8 x 9, torso 8 x 14 with the arms, legs 2 at
 * 3 x 16, a black outline on the back edge only, hand at (10, 22).
 *
 * Rows, in the rig's order (src/characters.js BEATS): idle (knee bend, 2),
 * up and down (the shuffle, feet apart and together, 2 each), swing (wind-up,
 * contact side-on with the fists 6 up the paddle, follow-through: 3), miss (the
 * head turned away, shoulders slumped 2: 1), win (a fist in the air, held; then
 * the hop: 2). Colours are indices into era 2's NES table, read out of the era
 * file itself, so the sheet cannot drift from what the court is painted in.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nesPalette, encodePng } from './era2-nes-quantize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FRAME = { w: 10, h: 44 };
export const HAND = { x: 10, y: 22 };
export const ROWS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
export const COLS = 3;

// Each player's inks, as NES indices (bible, era 2 PLAYERS). k is the outline.
// $30 white is the ball's colour, so the figure wears it on the shoes only
// (4 pixels, the bible's cap); the left player's shorts are $10 light grey.
export const PLAYERS = {
  left:  { k: 0x0F, hair: 0x0F, band: 0x16, skin: 0x27, shirt: 0x16, trim: 0x06, shorts: 0x10, shoe: 0x30 },
  right: { k: 0x0F, hair: 0x08, band: 0x12, skin: 0x27, shirt: 0x1A, trim: 0x0A, shorts: 0x12, shoe: 0x30 }
};

/** One frame's pose, as offsets and switches the painter reads. */
export function poseOf(beat, i) {
  const p = { body: 0, legs: 'stand', fist: 0, turn: false, arm: 'hold', sideOn: false, hop: 0 };
  if (beat === 'idle') p.body = i === 1 ? 1 : 0;
  else if (beat === 'up') { p.body = -1 * (i === 0 ? 1 : 0); p.legs = i === 0 ? 'apart' : 'together'; }
  else if (beat === 'down') { p.body = i === 0 ? 1 : 0; p.legs = i === 0 ? 'together' : 'apart'; }
  else if (beat === 'swing') {
    if (i === 0) { p.fist = 3; p.body = 1; }
    else if (i === 1) { p.fist = -6; p.sideOn = true; p.legs = 'apart'; }
    else { p.fist = -3; p.legs = 'apart'; }
  } else if (beat === 'miss') { p.body = 2; p.turn = true; p.fist = 3; }
  else if (beat === 'win') { p.arm = 'raise'; p.hop = i === 1 ? 2 : 0; p.legs = i === 1 ? 'tuck' : 'stand'; }
  return p;
}

/** Paint one frame into a w x h grid of NES indices (-1 is clear). */
export function paintFrame(beat, i, inks) {
  const g = Array.from({ length: FRAME.h }, () => new Array(FRAME.w).fill(-1));
  const set = (x, y, c) => { if (x >= 0 && x < FRAME.w && y >= 0 && y < FRAME.h) g[y][x] = c; };
  const rect = (x, y, w, h, c) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, c); };
  const p = poseOf(beat, i);
  const top = 3 + p.body - p.hop;                 // the head's first row
  const floor = FRAME.h - 1 - p.hop;              // the shoes' last row

  // legs: 3 wide each, skin, down to the shoes; the front leg nearer the paddle
  const hipY = top + 9 + 13 + 4;                  // below the shorts
  const legSets = {
    stand: [[2, 0], [5, 0]], apart: [[1, 0], [6, 0]], together: [[3, 0], [4, 0]], tuck: [[2, -3], [5, 0]]
  }[p.legs];
  for (const [lx, lift] of legSets) {
    rect(lx, hipY, 3, floor - 1 - hipY + lift, inks.skin);
    set(lx, hipY, inks.k);                        // the back edge of the thigh
    rect(lx, floor - 1 + lift, 3, 2, inks.shoe);
    set(lx, floor + lift, inks.k);
  }
  // shorts: 4 rows under the torso
  rect(1, top + 22, 8, 4, inks.shorts);
  set(1, top + 22, inks.k); set(1, top + 23, inks.k); set(1, top + 24, inks.k); set(1, top + 25, inks.k);
  // torso: 8 x 13, shirt, a trim stripe at the collar; side-on narrows it a column
  const tx = p.sideOn ? 2 : 1;
  rect(tx, top + 9, 8 - (p.sideOn ? 1 : 0), 13, inks.shirt);
  rect(tx, top + 9, 8 - (p.sideOn ? 1 : 0), 1, inks.trim);
  for (let y = top + 9; y < top + 22; y++) set(tx, y, inks.k);
  // the raised arm goes in before the head, so the head covers it and only the
  // fist shows above: a fist in the air (the Duck Hunt dog's held pose), not an
  // arm across the face; the other hand stays on the bat
  const shoulderY = top + 10;
  if (p.arm === 'raise') {
    const armTop = Math.max(0, top - 3);
    rect(4, armTop, 2, shoulderY - armTop, inks.skin);
    rect(3, armTop, 3, 2, inks.skin);
    set(3, armTop, inks.k);
    rect(6, shoulderY, 2, 2, inks.shirt);
  }
  // head: 8 x 9 -- hair, the band (or cap), the face toward the paddle
  const face = (x) => (p.turn ? 7 - x : x) + 1;   // mirrored when the head turns away
  const headRows = [
    '..hhhhh.',
    '.hhhhhhh',
    'bbbbbbbb',
    'hhssssss',
    'hsssskss',
    'hssssssk',
    '.ssssss.',
    '..sskss.',
    '...sss..'
  ];
  const mapInk = { h: inks.hair, b: inks.band, s: inks.skin, k: inks.k };
  headRows.forEach((row, r) => {
    for (let x = 0; x < 8; x++) if (row[x] !== '.') set(face(x), top + r, mapInk[row[x]]);
  });
  // arms: the sleeve from the shoulder, the forearm in skin, both fists on the
  // paddle's outer face at the hand row (plus the pose's fist offset)
  const fy = HAND.y + p.fist + (p.body > 0 && beat !== 'swing' ? Math.min(p.body, 2) : 0);
  if (p.arm !== 'raise') rect(6, shoulderY, 2, 3, inks.shirt);   // sleeve
  // the holding arm: shoulder down and forward to the fists
  const elbowY = Math.min(fy - 3, shoulderY + 6);
  for (let y = shoulderY + 3; y <= elbowY; y++) set(7, y, inks.skin);
  for (let y = Math.min(elbowY, fy - 2); y < fy - 1; y++) { set(7, y, inks.skin); set(8, y, inks.skin); }
  rect(8, fy - 1, 2, 3, inks.skin);               // two fists, stacked on the grip
  set(8, fy + 1, inks.k);
  set(9, fy - 1, inks.k);
  return g;
}

/** The whole sheet as RGBA: COLS frames across, one row per beat. */
export function buildSheet(side, pal = nesPalette()) {
  const inks = PLAYERS[side];
  const w = FRAME.w * COLS, h = FRAME.h * ROWS.length;
  const rgba = Buffer.alloc(w * h * 4);
  const framesOf = { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 };
  ROWS.forEach((beat, row) => {
    for (let i = 0; i < framesOf[beat]; i++) {
      const g = paintFrame(beat, i, inks);
      for (let y = 0; y < FRAME.h; y++) {
        for (let x = 0; x < FRAME.w; x++) {
          const c = g[y][x];
          if (c < 0) continue;
          const hex = pal[c];
          const d = (((row * FRAME.h + y) * w) + i * FRAME.w + x) * 4;
          rgba[d] = parseInt(hex.slice(1, 3), 16);
          rgba[d + 1] = parseInt(hex.slice(3, 5), 16);
          rgba[d + 2] = parseInt(hex.slice(5, 7), 16);
          rgba[d + 3] = 255;
        }
      }
    }
  });
  return { width: w, height: h, rgba };
}

// What each of the four era 2 player generations came to (item 1225).
const VERDICTS = {
  'era2-players-left': 'rejected: the 30 x 264 sprite sheet came back almost empty (a dozen stray pixels down a clear strip); pixflux does not draw a 3 x 6 sheet from a row-by-row prompt',
  'era2-players-right': 'rejected: the same as era2-players-left -- a near-empty strip',
  'era2-player-left-pose': 'reference only: a good 32 x 64 standing pose, but 28 pixels wide with the fists out and the room behind a paddle is 10; its headband, colours and big head are what era2-sheet-left.png is drawn to',
  'era2-player-right-pose': 'reference only: as era2-player-left-pose, for the rival in the blue cap; era2-sheet-right.png is drawn to it'
};

/** The manifest, brought up to date: verdicts on the four generations, and one derived entry per sheet. */
export function updateManifest(written) {
  const file = path.join(HERE, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const e of m.images) if (VERDICTS[e.name]) { e.verdict = VERDICTS[e.name]; e.card = 'item 1225'; }
  for (const { side, buf, width, height } of written) {
    const pose = m.images.find((e) => e.name === `era2-player-${side}-pose`);
    const entry = {
      name: `era2-sheet-${side}`,
      file: `era2-sheet-${side}.png`,
      prompt: pose.prompt,
      size: { width, height },
      style: pose.style,
      seed: pose.seed,
      date: pose.date,
      cost: { type: 'derived', generations: 0 },
      derivedFrom: pose.file,
      derivedBy: 'node assets/pixellab/era2-players-sheet.mjs',
      how: 'drawn pixel by pixel in the script from the art bible\'s era 2 silhouette (head 8 x 9, torso 8 x 14, legs 3 x 16, back-edge outline, hand at 10,22) in NES inks, the pose image as the reference for who the character is; six rows (idle, up, down, swing, miss, win) of 3 frames of 10 x 44',
      card: 'item 1225',
      verdict: 'worn by the ' + (side === 'left' ? 'player' : 'computer') + ' on era 2 (src/characters.js, the NES block\'s sheets.' + side + ')',
      pixels: { width, height },
      bytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      endpoint: pose.endpoint,
      request: pose.request
    };
    // Filed before the poses: a derived entry carries its pose's date, and the
    // pixellab tool reads the cost of one image off the LAST of the newest
    // entries (tools/pixellab.mjs describeCostOfOne), which must be a billed one.
    const at = m.images.findIndex((e) => e.name === entry.name);
    if (at >= 0) m.images.splice(at, 1);
    m.images.splice(m.images.findIndex((e) => e.name === 'era2-player-left-pose'), 0, entry);
  }
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
}

export function main(log = console.log) {
  const pal = nesPalette();
  const written = [];
  for (const side of ['left', 'right']) {
    const img = buildSheet(side, pal);
    const file = path.join(HERE, `era2-sheet-${side}.png`);
    const buf = encodePng(img.width, img.height, img.rgba);
    fs.writeFileSync(file, buf);
    written.push({ side, buf, width: img.width, height: img.height });
    log(`${path.basename(file)}: ${img.width} x ${img.height}`);
  }
  updateManifest(written);
  log('manifest.json: verdicts on the 4 generations, 2 derived sheet entries');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
