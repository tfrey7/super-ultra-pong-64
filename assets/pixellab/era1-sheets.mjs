/*
 * Era 1's two players, drawn in code (item 1224) -- 0 pixellab generations.
 *
 *   node assets/pixellab/era1-sheets.mjs
 *
 * The art bible (docs/ART.md, Era 1, PLAYERS) gives each player as a 6 x 28
 * one-colour 2600 sprite with six rows of beats. pixflux was asked for exactly
 * that twice (era1-players-left.png and era1-players-right.png, 1 generation
 * each) and neither came back as a sheet: at 18 x 168 it drew a column of
 * crawling shapes and a smear of noise. So, as the bible's fallback says, the
 * silhouettes are painted here, pixel by pixel, from its own rows:
 *
 *   head 4 x 5, torso 4 x 9 with the arm a double line out to the paddle's
 *   face at the paddle's middle height, legs 2 wide and 11 long with a gap;
 *   the right player's head sits one row lower, straight on its shoulders,
 *   so the two do not read as one sprite mirrored.
 *
 * (The bible's torso is 6 wide; in a 6-wide frame that leaves no column for
 * the arm, so the torso is 4 and the arm takes the last two.)
 *
 * A 2600 player sprite has ONE colour register, and the bible puts each
 * player in its paddle's ink -- which the session earns at its first point,
 * one of era 1's twelve. The rig draws a PNG as it is, so every ink gets its
 * own pair of sheets: era1-left-<i>.png and era1-right-<i>.png, i the ink's
 * index in era 1's palette. 24 files of about 200 bytes. The era file tells
 * the rig which pair to wear (its look's playerSheets).
 *
 * Each sheet is 18 x 168: 3 columns of 6-pixel frames, 6 rows of 28, in the
 * rig's beat order idle, up, down, swing, miss, win (frames 2, 2, 2, 3, 1, 2).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePng } from './era2-nes-quantize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ERA_FILE = path.join(HERE, '..', '..', 'src', 'eras', 'era1-atari2600.js');

export const FRAME = { w: 6, h: 28 };
export const HAND = { x: 6, y: 14 };      // the rig's hand pixel: the frame's right edge
export const BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
export const FRAMES = { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 };
export const COLS = 3;

/** Era 1's twelve paddle inks, read from the era file so the two never drift. */
export function paddleInks(src = fs.readFileSync(ERA_FILE, 'utf8')) {
  const block = /PADDLE_INKS\s*=\s*\[([\s\S]*?)\]/.exec(src);
  if (!block) throw new Error('no PADDLE_INKS in ' + ERA_FILE);
  return [...block[1].matchAll(/'(#[0-9a-f]{6})'/gi)].map((m) => m[1].toLowerCase());
}

/**
 * One pose as a 6 x 28 grid of 0/1, facing right. side 'left' or 'right',
 * beat one of BEATS, i the frame within it.
 */
export function pose(side, beat, i) {
  const g = Array.from({ length: FRAME.h }, () => new Array(FRAME.w).fill(0));
  const rect = (x, y, w, h) => {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) {
      if (r >= 0 && r < FRAME.h && c >= 0 && c < FRAME.w) g[r][c] = 1;
    }
  };
  const low = side === 'right' ? 1 : 0;     // the right player's head, one row lower
  let lift = 0;                             // the whole upper body, rows up (+) or down (-)
  let legs = [[0, 2], [3, 2]];              // [x, w] pairs: together, one row of daylight
  let legTop = 17;
  let arm = 13;                             // the arm's top row: 13-14 holds the hand
  let armKind = 'hold';
  let headDrop = 0;
  let torsoTop = 8;

  if (beat === 'idle') {
    lift = i % 2 ? -1 : 0;                  // the one-row bob
  } else if (beat === 'up' || beat === 'down') {
    legs = i % 2 ? [[1, 2], [3, 2]] : [[0, 2], [4, 2]];   // legs apart on alternate frames
    lift = beat === 'up' ? 1 : -1;          // stretching up, crouching down
  } else if (beat === 'swing') {
    arm = [11, 9, 13][i] ?? 13;             // the arm row jumps up, up, then back
    armKind = 'swing';
    legs = [[0, 2], [4, 2]];
  } else if (beat === 'miss') {
    headDrop = 3;                           // the head drops into the torso
    torsoTop = 10;                          // the torso two rows shorter
    armKind = 'hang';
  } else if (beat === 'win') {
    armKind = 'raised';                     // the hop is in the legs: feet off the ground
    legs = [[1, 2], [3, 2]];
  }

  // Legs, rooted to the ground unless hopping.
  const hop = beat === 'win' && i % 2 === 0 ? 2 : 0;   // the 2-pixel hop, feet tucked up
  for (const [x, w] of legs) rect(x, legTop, w, FRAME.h - legTop - hop);
  // Torso.
  const tTop = torsoTop - lift;
  rect(0, tTop, 4, legTop - tTop);
  // Head and neck.
  const headY = 2 + low + headDrop - lift;
  rect(1, headY, 4, 5);
  if (!low && !headDrop) rect(2, headY + 5, 1, Math.max(0, tTop - headY - 5));
  // Arms.
  if (armKind === 'hold') {
    rect(3, arm, 3, 2);
  } else if (armKind === 'swing') {
    rect(3, arm, 3, 2);
    if (i === 1) rect(5, arm, 1, 6);        // the bat's sweep, a column down to the hand
  } else if (armKind === 'hang') {
    rect(4, tTop + 2, 1, 7);
  } else if (armKind === 'raised') {
    rect(0, 0, 1, headY + 2);               // both arms straight up past the head: \\o/
    rect(5, 0, 1, headY + 2);
  }
  return g;
}

/** A whole sheet in one ink, as RGBA bytes: { width, height, rgba }. */
export function sheet(side, ink) {
  const width = FRAME.w * COLS;
  const height = FRAME.h * BEATS.length;
  const rgba = Buffer.alloc(width * height * 4);
  const r = parseInt(ink.slice(1, 3), 16);
  const gr = parseInt(ink.slice(3, 5), 16);
  const b = parseInt(ink.slice(5, 7), 16);
  BEATS.forEach((beat, row) => {
    for (let i = 0; i < FRAMES[beat]; i++) {
      const g = pose(side, beat, i);
      for (let y = 0; y < FRAME.h; y++) for (let x = 0; x < FRAME.w; x++) {
        if (!g[y][x]) continue;
        const o = ((row * FRAME.h + y) * width + i * FRAME.w + x) * 4;
        rgba[o] = r; rgba[o + 1] = gr; rgba[o + 2] = b; rgba[o + 3] = 255;
      }
    }
  });
  return { width, height, rgba };
}

/** The file name one side wears in one ink index. */
export function sheetName(side, index) {
  return 'era1-' + (side === 'right' ? 'right' : 'left') + '-' + index;
}

const MANIFEST = path.join(HERE, 'manifest.json');
const REJECTED = 'rejected (item 1224): pixflux did not lay out a 3 x 6 sprite sheet at 18 x 168 -- ' +
  'see docs/shots/item-1224/pixflux-sheets-rejected.png; the players are painted in code by ' +
  'assets/pixellab/era1-sheets.mjs instead';

/** Write every sheet and record each in the manifest (a derived image, 0 generations). */
export function main(log = console.log) {
  const inks = paddleInks();
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  // A derived entry keeps the date of the generation it stands in for (as era 2's
  // quantized court does), so the balance's 'cost of one image' still reads the
  // newest real bill rather than this 0.
  const source = manifest.images.find((e) => e.name === 'era1-players-right');
  const date = source ? source.date : new Date().toISOString();
  let n = 0;
  for (const side of ['left', 'right']) {
    inks.forEach((ink, idx) => {
      const s = sheet(side, ink);
      const name = sheetName(side, idx);
      const buf = encodePng(s.width, s.height, s.rgba);
      fs.writeFileSync(path.join(HERE, name + '.png'), buf);
      const prompt = 'painted in code, no generation: era 1\'s ' + (side === 'right' ? 'computer' : 'player') +
        ', a one-colour 2600 sprite in ' + ink + ', 3 x 6 frames of 6 x 28 (idle, up, down, swing, miss, win)';
      const entry = {
        name, file: name + '.png', prompt,
        size: { width: s.width, height: s.height },
        style: { painted: 'pixel by pixel from docs/ART.md, Era 1, PLAYERS' },
        seed: 0, date,
        cost: { type: 'derived', generations: 0 },
        derivedBy: 'node assets/pixellab/era1-sheets.mjs',
        how: 'the bible\'s silhouette rows painted into a grid, one ink index ' + idx + ' of era 1\'s palette',
        card: 'item 1224',
        verdict: 'drawn by src/characters.js for era 1, the pair named by era 1\'s look (playerSheets)',
        pixels: { width: s.width, height: s.height },
        bytes: buf.length,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        endpoint: 'none',
        request: { description: prompt, seed: 0 }
      };
      const at = manifest.images.findIndex((e) => e.name === name);
      if (at >= 0) manifest.images[at] = entry; else manifest.images.push(entry);
      n++;
    });
  }
  for (const e of manifest.images) if (/^era1-players-(left|right)$/.test(e.name)) e.verdict = REJECTED;
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  log('era1-sheets: wrote ' + n + ' sheets, ' + inks.length + ' inks x 2 players, 18 x 168 each');
  return n;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
