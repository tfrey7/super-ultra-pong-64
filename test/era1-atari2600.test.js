'use strict';
/*
 * Era 1 -- the 1977 Atari 2600 match (item 1224, docs/ART.md "Era 1").
 *
 * The arena (src/eras/era1-atari2600.js) is recorded headless as
 * [fillStyle, x, y, w, h] calls; the players are the rig's (src/characters.js),
 * wearing sheets laid out by assets/pixellab/era1-sheets.mjs from the text grids
 * assets/spritegen/era1-left.json and era1-right.json (item 1278).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const C = require('../src/characters.js');
const ASSETS = path.join(ROOT, 'assets', 'pixellab');

const PLAYFIELD = '#2c3a7a';
const BALL_INK = '#f0fff6';
const PX = 5, LINE = 3.125;

function midRally(rng = 0.1) {
  const g = Pong.createGame({ rng: () => rng, phase: 'playing', era: 1 });
  if (!g.colour && Pong.advanceEra) { g.era = 0; Pong.advanceEra(g); }
  g.score.left = 1; g.score.right = 0;
  g.serveDelay = 0;
  g.ball.x = 402; g.ball.y = 300;
  g.left.y = 100; g.right.y = 350;
  return g;
}

function frame(g, opts) {
  const rec = eralooks.recorder();
  R.draw(rec.ctx, g, opts);
  return rec.calls;
}

test('era 1 draws its own arena: black field, the playfield wall top and bottom', () => {
  const g = midRally();
  const calls = frame(g);
  assert.deepStrictEqual(calls[0], [R.FIELD_INK, 0, 0, g.width, g.height], 'the black field first');
  const wall = calls.filter(([f, x, y, w, h]) => f === PLAYFIELD && x === 0 && w === g.width && h === 4 * LINE);
  assert.ok(wall.some((c) => c[2] === 0), 'the wall along the top, 4 lines');
  assert.ok(wall.some((c) => c[2] === g.height - 4 * LINE), 'and along the bottom');
});

test('the stand is mirrored blocks, every other one missing, and its two patterns swap every 16 frames', () => {
  const g = midRally();
  const blocks = (calls) => calls.filter(([f, , y, w, h]) => f === PLAYFIELD && w === 4 * PX && h === 6 * LINE && y < 80)
    .map(([, x, y]) => x + ',' + y).sort();
  g.time = 10;
  const a = blocks(frame(g));
  assert.strictEqual(a.length, 3 * 20, '3 rows of 20 blocks, half of the 40 across');
  for (const b of a) {
    const [x, y] = b.split(',').map(Number);
    assert.ok(a.includes((g.width - x - 4 * PX) + ',' + y), 'mirrored across the centre: ' + b);
  }
  g.time = 10 + 16 / 60;
  const b = blocks(frame(g));
  assert.strictEqual(b.length, a.length);
  assert.ok(!b.some((k) => a.includes(k)), 'the other pattern: no block lit in both');
});

test('the ball is the picture chip\'s ball: 2 pixels by 4 lines, phosphor white, hidden while the serve waits', () => {
  const g = midRally();
  const balls = frame(g).filter(([f]) => f === BALL_INK);
  assert.strictEqual(balls.length, 1);
  const [, x, y, w, h] = balls[0];
  assert.strictEqual(w, 2 * PX); assert.strictEqual(h, 4 * LINE);
  assert.ok(Math.abs(x + w / 2 - (g.ball.x + g.ball.size / 2)) <= PX, 'centred on the ball across');
  assert.ok(Math.abs(y + h / 2 - (g.ball.y + g.ball.size / 2)) <= LINE, 'and down');
  g.serveDelay = 0.5;
  assert.strictEqual(frame(g).filter(([f]) => f === BALL_INK).length, 0);
});

test('the paddles are still the hit zones, whole, in their earned inks', () => {
  const g = midRally();
  const calls = frame(g);
  for (const side of ['left', 'right']) {
    const p = g[side];
    assert.ok(calls.some(([f, x, y, w, h]) => f === R.paddleInk(g, side) && x === p.x && y === p.y && w === p.w && h === p.h),
      side + ' paddle drawn as its rectangle');
  }
});

test('the scores are playfield-block digits, 4 pixels by 4 lines a block, each in its player\'s ink', () => {
  const g = midRally();
  const calls = frame(g);
  const inkL = R.paddleInk(g, 'left');
  const digit = calls.filter(([f, , y, w, h]) => f === inkL && w === 4 * PX && h === 4 * LINE && y < 110);
  assert.ok(digit.length >= 5, 'the left score\'s "1" is at least five blocks');
});

test('the rally meter: a pixel a hit this serve under each number, gone at the next serve', () => {
  const g = midRally();
  g.rally = 3;
  g.time = 5;
  g.events = [{ type: 'paddle', side: 'left', time: 4.8 }, { type: 'paddle', side: 'right', time: 4.9 },
              { type: 'paddle', side: 'left', time: 5 }];
  const meter = (calls, ink) => calls.filter(([f, , , w, h]) => f === ink && h === LINE && w % PX === 0 && w <= 20 * PX);
  let calls = frame(g);
  assert.strictEqual(meter(calls, R.paddleInk(g, 'left'))[0][3], 2 * PX, 'the player has hit it twice');
  assert.strictEqual(meter(calls, R.paddleInk(g, 'right'))[0][3], 1 * PX, 'the computer once');
  g.events = []; g.rally = 0; g.time = 6;
  calls = frame(g);
  assert.strictEqual(meter(calls, R.paddleInk(g, 'left')).length, 0, 'a new serve empties it');
});

test('a point flashes the scorer\'s number 4 frames on, 4 off, and speeds the stand for a second', () => {
  const g = midRally();
  g.time = 20;
  g.events = [{ type: 'score', side: 'left', time: 20 }];
  const inkL = R.paddleInk(g, 'left');
  const digits = (calls) => calls.filter(([f, , y, w, h]) => f === inkL && w === 4 * PX && h === 4 * LINE && y < 110).length;
  assert.ok(digits(frame(g)) > 0, 'lit on the point');
  g.events = [];
  g.time = 20 + 5 / 60;
  assert.strictEqual(digits(frame(g)), 0, 'dark for the next four frames');
  g.time = 20 + 9 / 60;
  assert.ok(digits(frame(g)) > 0, 'lit again');
  g.time = 20 + 30 / 60;
  assert.ok(digits(frame(g)) > 0, 'steady after 0.4 s');
  // The stand swaps every 4 frames inside the second after the point.
  const stand = (t) => { g.time = t; return JSON.stringify(frame(g).filter(([f, , y, w]) => f === PLAYFIELD && w === 4 * PX && y < 80)); };
  assert.notStrictEqual(stand(20.5), stand(20.5 + 4 / 60), 'fast flicker');
});

test('match point: the leader\'s ink under the wall on alternate frames', () => {
  const saved = globalThis.Pong;
  globalThis.Pong = Pong;
  try {
    const g = midRally();
    g.score.left = 6; g.score.right = 4;
    const orig = Pong.isMatchPoint;
    Pong.isMatchPoint = () => true;
    try {
      const stripe = (t) => { g.time = t; return frame(g).filter(([f, x, y, w, h]) => f === R.paddleInk(g, 'left') && w === g.width && h === 2 * LINE); };
      const a = stripe(1), b = stripe(1 + 1 / 60);
      assert.ok((a.length > 0) !== (b.length > 0), 'on one frame, off the next');
    } finally { Pong.isMatchPoint = orig; }
  } finally { globalThis.Pong = saved; }
});

test('behind the title era 1 is still the plain monochrome frame', () => {
  const calls = frame(midRally(), { ink: '#3a3a3a' });
  assert.ok(!calls.some(([f]) => f === PLAYFIELD || f === BALL_INK));
});

test('the rig: era 1\'s block is the bible\'s sheet line, and each side wears the sheet in its own paddle\'s ink', () => {
  const g = midRally(0.93);
  frame(g);                         // era 1's draw names the pair this frame wears
  const inks = R.eraLook(1).palette;
  const left = C.configFor(1, 'left');
  const right = C.configFor(1, 'right');
  assert.deepStrictEqual(left.frame, { w: 6, h: 28 });
  assert.deepStrictEqual(left.hand, { x: 6, y: 14 });
  assert.strictEqual(left.scale, 5);
  assert.strictEqual(left.fps, 7.5);
  assert.ok(left.frame.w * left.scale <= 32, 'fits the room between the wall and the paddle');
  const idx = (side) => inks.indexOf(R.paddleInk(g, side));
  assert.strictEqual(left.sheet, 'era1-left-' + idx('left'));
  assert.strictEqual(right.sheet, 'era1-right-' + idx('right'));
});

test('every sheet the rig can ask for is on disk: 18 x 168, one per ink and side', () => {
  const inks = R.eraLook(1).palette;
  for (const side of ['left', 'right']) {
    for (let i = 0; i < inks.length; i++) {
      const buf = fs.readFileSync(path.join(ASSETS, 'era1-' + side + '-' + i + '.png'));
      assert.deepStrictEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [18, 168], side + ' ' + i);
    }
  }
});

test('the painted poses: all five beats, the hand on the paddle, the two players not one sprite mirrored', async () => {
  const S = await import('../assets/pixellab/era1-sheets.mjs');
  const lit = (g) => g.flat().reduce((a, b) => a + b, 0);
  for (const beat of S.BEATS) {
    for (let i = 0; i < S.FRAMES[beat]; i++) {
      const g = S.pose('left', beat, i);
      assert.strictEqual(g.length, 28); assert.strictEqual(g[0].length, 6);
      assert.ok(lit(g) > 40, beat + ' ' + i + ' is a figure');
    }
  }
  for (const beat of ['idle', 'up', 'down']) {
    for (let i = 0; i < 2; i++) assert.strictEqual(S.pose('left', beat, i)[13][5], 1, beat + ' holds the paddle at its middle');
  }
  assert.notDeepStrictEqual(S.pose('left', 'idle', 0), S.pose('right', 'idle', 0), 'the right player is its own sheet');
  assert.notDeepStrictEqual(S.pose('left', 'win', 1)[0], S.pose('left', 'idle', 0)[0], 'the win raises the arms');
  assert.notDeepStrictEqual(S.pose('left', 'swing', 1), S.pose('left', 'idle', 0), 'the swing moves the arm');
});

test('item 1278: every era 1 sheet on disk is its text grid in that ink, the grids pass the 2600 checker, and the beats really move', async () => {
  const SG = await import('../tools/spritegen.mjs');
  const { decode } = await import('../tools/palette-snap.mjs');
  const S = await import('../assets/pixellab/era1-sheets.mjs');
  const inks = S.paddleInks();
  for (const side of ['left', 'right']) {
    const doc = SG.load(path.join(ROOT, 'assets', 'spritegen', 'era1-' + side + '.json'));
    const res = SG.lint(doc);
    assert.deepStrictEqual(res.faults, [], side + ' passes the 2600 rules');
    assert.strictEqual(res.nums.unique, res.nums.frames, side + ': no two frames the same pose');
    for (let i = 0; i < inks.length; i++) {
      const want = S.sheet(side, inks[i]);
      const got = decode(fs.readFileSync(path.join(ASSETS, 'era1-' + side + '-' + i + '.png')));
      assert.ok(Buffer.compare(Buffer.from(got.rgba), want.rgba) === 0, side + ' ink ' + i + ' is its grid (re-run node assets/pixellab/era1-sheets.mjs)');
    }
    // real movement: each beat differs from idle0 in a good share of its pixels
    const idle = S.pose(side, 'idle', 0).flat();
    for (const [beat, i] of [['up', 0], ['down', 0], ['swing', 0], ['swing', 2], ['miss', 0], ['win', 0]]) {
      const f = S.pose(side, beat, i).flat();
      const moved = f.reduce((n, v, k) => n + (v !== idle[k] ? 1 : 0), 0);
      assert.ok(moved >= 12, side + ' ' + beat + i + ' moves ' + moved + ' pixels from idle0');
    }
  }
  // the ERAS rule itself: one colour a line and an 8-pixel register
  const wide = { format: 'pgrid-v1', id: 't', era: 1, frame: { w: 10, h: 1 }, beats: { idle: 1 }, palette: { a: inks[0], b: inks[1] },
    frames: { idle0: ['a........a'] } };
  assert.ok(SG.lint(wide).faults.some((f) => /register is 8 wide/.test(f)));
  wide.frames.idle0 = ['ab........'];
  assert.ok(SG.lint(wide).faults.some((f) => /one a line/.test(f)));
  wide.palette.a = '#123456';
  assert.ok(SG.lint(wide).faults.some((f) => /off the Atari 2600's colours/.test(f)));
});
