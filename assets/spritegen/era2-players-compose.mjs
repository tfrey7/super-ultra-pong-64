#!/usr/bin/env node
/*
 * Era 2's two NES players, drawn as text grids (item 1279).
 *
 *   node assets/spritegen/era2-players-compose.mjs
 *   -> assets/spritegen/era2-boy.json, era2-rival.json (pgrid-v1)
 *
 * Every frame is drawn, one character a pixel, from the parts below: a head,
 * a torso with its arm, the hips and the legs, stacked top to bottom, the upper
 * body dropped `lift` rows onto the legs (a knee bend, a crouch, a slump), then
 * any `over` rows laid on top ('.' and '_' keep what is there) for an arm that
 * crosses from one part into another. The parts are the drawing; this file only
 * stacks them, so a pose is revised by editing its rows, the EarthBound way.
 *
 * The letters are semantic and the two characters share the body drawing:
 *   k outline and the boy's hair   a skin   b shirt   c shorts   d white
 *   h the headband or the cap      n the rival's hair
 * The boy's headband is his shirt's red, so his `h` is written as `b`; the
 * rival's cap is his shorts' blue, so his `h` is written as `c`. Each figure is
 * five or six NES colours out of the 2C02 table (docs/ART.md, Era 2, PLAYERS).
 *
 * 10 x 44, facing right, the fist on the handle at (10, 22); the paddle is
 * drawn there by src/characters.js. Rows 0-10 head, 11-23 torso, 24-27 hips,
 * 28-43 legs, the soles on row 43.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify, lint } from '../../tools/spritegen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- heads, 11 rows ------------------------------------------------------------
const BOY = {
  front: [
    '..........',
    '...kkkk...',
    '..kkkkkkk.',
    'hhhhhhhhh.',
    '.hkkaaaka.',
    '..kkaaaaaa',
    '..kaaaaaa.',
    '..kaaaakk.',
    '...kaaaa..',
    '....kaa...',
    '.....aa...'],
  up: [
    '...kkkk...',
    '..kkkkkkk.',
    'hhhhhhhhh.',
    'h.kkaaaka.',
    '..kkaaaaaa',
    '..kaaaaaa.',
    '..kaaaakk.',
    '...kaaaa..',
    '....kaa...',
    '.....aa...',
    '.....aa...'],
  down: [
    '..........',
    '..........',
    '...kkkk...',
    '..kkkkkkk.',
    '.hhhhhhhh.',
    '.hkkaaaa..',
    '..kkaaakaa',
    '..kaaaaaa.',
    '..kaaaakk.',
    '...kaaaa..',
    '....kaaa..'],
  away: [
    '..........',
    '..........',
    '..........',
    '...kkkk...',
    '..kkkkkkk.',
    '.hhhhhhhhh',
    '.akaakkkkh',
    'aaaaaakkk.',
    '.aaaaakkk.',
    '..kaaakk..',
    '...aaak...'],
  win: [
    '..........',
    '...kkkk...',
    '..kkkkkkk.',
    'hhhhhhhhh.',
    'h.kkaakk..',
    '..kkaaaaaa',
    '..kaaaaaa.',
    '..kaakkkk.',
    '...kakkk..',
    '....kaa...',
    '.....aa...']
};
const RIVAL = {
  front: [
    '..........',
    '...hhhh...',
    '..hhhhhh..',
    '.hhhhhhhhh',
    '.nnaaanaa.',
    '.nnaaaaaaa',
    '..naaaaaa.',
    '..naaaann.',
    '...kaaaa..',
    '....kaa...',
    '.....aa...'],
  up: [
    '...hhhh...',
    '..hhhhhh..',
    '.hhhhhhhhh',
    '.nnaaanaa.',
    '.nnaaaaaaa',
    '..naaaaaa.',
    '..naaaann.',
    '...kaaaa..',
    '....kaa...',
    '.....aa...',
    '.....aa...'],
  down: [
    '..........',
    '..........',
    '...hhhh...',
    '..hhhhhh..',
    '.hhhhhhhhh',
    '.nnaaaaaa.',
    '.nnaaaanaa',
    '..naaaaaa.',
    '..naaaann.',
    '...kaaaa..',
    '....kaaa..'],
  away: [
    '..........',
    '..........',
    '..........',
    '...hhhh...',
    '..hhhhhh..',
    'hhhhhhhhh.',
    '.anaannnn.',
    'aaaaaannn.',
    '.aaaaannn.',
    '..kaaakk..',
    '...aaak...'],
  win: [
    '..........',
    '...hhhh...',
    '..hhhhhh..',
    '.hhhhhhhhh',
    '.nnaannn..',
    '.nnaaaaaaa',
    '..naaaaaa.',
    '..naannnn.',
    '...kannn..',
    '....kaa...',
    '.....aa...']
};

// ---- torsos with the arm, 13 rows (11-23) ----------------------------------------
const TORSO = {
  // the fist on the handle, the elbow down at the side
  idle: [
    '..bbbbbb..',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbab.',
    '.kbbbbbab.',
    '.kbbbbbab.',
    '.kbbbbbaa.',
    '.kbbbbbbaa',
    '.kbbbbbbaa',
    '.kbbbbbbka',
    '.kbbbbbbaa',
    '.kbbbbbbaa',
    '.kbbbbbbb.'],
  // wind-up: leaning back a pixel, the elbow cocked out, the fist dropped low
  windup: [
    '.bbbbbb...',
    'kbbbbbbb..',
    'kbbbbbbb..',
    'kbbbbbbb..',
    'kbbbbbbba.',
    'kbbbbbbaa.',
    'kbbbbbbba.',
    'kbbbbbbba.',
    'kbbbbbbbaa',
    'kbbbbbbbaa',
    'kbbbbbbbaa',
    'kbbbbbbbka',
    'kbbbbbbbaa'],
  // contact: turned side-on (narrower), shoulder forward, the fist jumped up
  contact: [
    '...bbbb.aa',
    '..kbbbbaaa',
    '..kbbbbaka',
    '..kbbbbba.',
    '..kbbbbbb.',
    '..kbbbbbb.',
    '..kbbbbbb.',
    '..kbbbbbb.',
    '..kbbbbbb.',
    '..kbbbbbb.',
    '..kbbbbbb.',
    '..kbbbbbb.',
    '..kbbbbbb.'],
  // follow-through: square again, the arm thrown up and across
  follow: [
    '..bbbbbbaa',
    '.kbbbbbaaa',
    '.kbbbbbbak',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.'],
  // miss: shoulders rounded, the arm hanging off the handle
  slump: [
    '...bbbb...',
    '..kbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbab.',
    '.kbbbbbab.',
    '.kbbbbbab.',
    '.kbbbbbab.',
    '.kbbbbbab.',
    '.kbbbbbab.',
    '.kbbbbbaa.',
    '.kbbbbbaa.',
    '.kbbbbbkk.'],
  // win: the arm straight up beside the head (the fist is laid over the head rows)
  win: [
    '..bbbbbaa.',
    '.kbbbbbba.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.',
    '.kbbbbbbb.']
};
const WIN_FIST = { 2: '_______kk_', 3: '_______aak', 4: '_______aak', 5: '_______ka_', 6: '________a_', 7: '________a_', 8: '________a_', 9: '________a_', 10: '_______aa_' };

// ---- hips, 4 rows (24-27) ------------------------------------------------------------
const HIPS = [
  '.kccccccc.',
  '.kccccccc.',
  '.kccccccc.',
  '.kcccc.cc.'];

// ---- legs, 16 rows (28-43), the soles on the last ------------------------------------
const LEGS = {
  stand: [
    ...Array(14).fill('..aaa.aaa.'),
    '..kkd.kkd.',
    '.kkkk.kkkk'],
  bend: [
    ...Array(4).fill('..aaa.aaa.'),
    '.aaa...aaa', '.aaa...aaa', '.aaa...aaa', '.aaa...aaa',
    ...Array(6).fill('..aaa.aaa.'),
    '..kkd.kkd.',
    '.kkkk.kkkk'],
  apart: [
    '..aaa.aaa.', '..aaa.aaa.', '..aaa.aaa.',
    '.aaa..aaa.', '.aaa...aaa', '.aaa...aaa',
    ...Array(8).fill('aaa....aaa'),
    'kkd....kkd',
    'kkkk...kkk'],
  together: [
    '..aaa.aaa.', '..aaa.aaa.',
    '...aakaa..', '...aakaa..', '...aakaa..', '...aakaa..',
    '...aakaa..', '...aakaa..', '...aakaa..', '...aakaa..',
    '...aakaa..', '...aakaa..', '...aakaa..', '...aakaa..',
    '...kkkkd..',
    '..kkkkkkk.'],
  lunge: [
    '..aaa.aaa.', '.aaa..aaa.', '.aaa..aaa.', '.aaa...aaa',
    'aaa....aaa', 'aaa....aaa', 'aa.....aaa', 'aa.....aaa',
    'aa.....aaa', 'aa.....aaa', 'aa.....aaa', 'aa.....aaa',
    'aa.....aaa', 'aa.....aaa',
    'kd.....kkd',
    'kk.....kkk']
};

// ---- the poses -------------------------------------------------------------------------
// head, torso, legs, how far the upper body drops onto the legs, what lies over it
const POSES = {
  idle0: ['front', 'idle', 'stand', 0],
  idle1: ['front', 'idle', 'bend', 1],
  up0: ['up', 'idle', 'apart', 0],
  up1: ['up', 'idle', 'together', 0],
  down0: ['down', 'idle', 'apart', 1],
  down1: ['down', 'idle', 'together', 1],
  swing0: ['front', 'windup', 'bend', 2],
  swing1: ['front', 'contact', 'lunge', 1],
  swing2: ['front', 'follow', 'lunge', 0],
  miss0: ['away', 'slump', 'together', 1],
  win0: ['win', 'win', 'stand', 0, WIN_FIST]
};

function frameOf(heads, [head, torso, legs, lift, over]) {
  const upper = [...heads[head], ...TORSO[torso], ...HIPS];            // rows 0-27
  const rows = Array(44).fill('..........');
  LEGS[legs].forEach((r, i) => { rows[28 + i] = r; });
  upper.forEach((r, i) => {
    const y = i + lift;
    if (y < 0 || y > 43) return;
    // the upper body lies over the legs where it reaches them
    rows[y] = y >= 28 ? r.split('').map((c, x) => (c === '.' ? rows[y][x] : c)).join('') : r;
  });
  for (const [y, text] of Object.entries(over || {})) {
    rows[+y] = text.split('').map((c, x) => (c === '_' || c === '.' ? rows[+y][x] : c)).join('');
  }
  for (const r of rows) if (r.length !== 10) throw new Error(`a row is ${r.length} wide: ${r}`);
  return rows;
}

function sheet(id, heads, map, palette, prompt) {
  const frames = {};
  for (const [name, pose] of Object.entries(POSES)) {
    frames[name] = frameOf(heads, pose).map((r) => r.replace(/[hn]/g, (c) => map[c] || c));
  }
  // the win's hop: the whole held pose two rows up
  frames.win1 = { from: 'win0', dy: -2 };
  return { format: 'pgrid-v1', id, era: 2, prompt, reference: `assets/pixellab/era2-sheet-${id === 'era2-boy' ? 'left' : 'right'}.png`,
    frame: { w: 10, h: 44 }, hand: { x: 10, y: 22 },
    beats: { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 }, palette, frames };
}

const boy = sheet('era2-boy', BOY, { h: 'b', n: 'k' },
  { k: '#000000', a: '#fca044', b: '#f83800', c: '#bcbcbc', d: '#fcfcfc' },
  'NES 1985, the player: a boy athlete in a red headband and red shirt, grey shorts, black sneakers with white toes, facing right, a fist on the bat handle');
const rival = sheet('era2-rival', RIVAL, { h: 'c' },
  { k: '#000000', a: '#fca044', b: '#00a800', c: '#0058f8', d: '#fcfcfc', n: '#503000' },
  'NES 1985, the computer: a rival in a blue cap and green shirt, blue shorts, brown hair, black sneakers with white toes, facing right (the rig mirrors him), a fist on the bat handle');

for (const doc of [boy, rival]) {
  const file = path.join(HERE, `${doc.id}.json`);
  fs.writeFileSync(file, stringify(doc));
  const r = lint(doc);
  console.log(`${doc.id}: ${r.faults.length} faults, ${r.notes.length} notes, ${r.nums.colours} colours, ${r.nums.unique} unique of ${r.nums.frames}`);
}
