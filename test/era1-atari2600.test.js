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

const PLAYFIELD = '#8e8e8e';      // COLUPF, hue 0 luminance 3 (item 1287)
const BALL_INK = PLAYFIELD;       // the TIA's ball is drawn in the playfield's colour
const PX = 5, LINE = 3.125;

/*
 * Item 1287: the 2600's 128-colour NTSC palette, 16 hues x 8 luminances, as
 * Stella's standard NTSC table has it (stella-emu/stella,
 * src/common/PaletteHandler.cxx, ourNTSCPalette). NTSC[hue][luminance]; the
 * colour byte a cartridge writes is hue << 4 | luminance << 1.
 */
const NTSC = [
  ['000000', '4a4a4a', '6f6f6f', '8e8e8e', 'aaaaaa', 'c0c0c0', 'd6d6d6', 'ececec'],
  ['484800', '69690f', '86861d', 'a2a22a', 'bbbb35', 'd2d240', 'e8e84a', 'fcfc54'],
  ['7c2c00', '904811', 'a26221', 'b47a30', 'c3903d', 'd2a44a', 'dfb755', 'ecc860'],
  ['901c00', 'a33915', 'b55328', 'c66c3a', 'd5824a', 'e39759', 'f0aa67', 'fcbc74'],
  ['940000', 'a71a1a', 'b83232', 'c84848', 'd65c5c', 'e46f6f', 'f08080', 'fc9090'],
  ['840064', '97197a', 'a8308f', 'b846a2', 'c659b3', 'd46cc3', 'e07cd2', 'ec8ce0'],
  ['500084', '68199a', '7d30ad', '9246c0', 'a459d0', 'b56ce0', 'c57cee', 'd48cfc'],
  ['140090', '331aa3', '4e32b5', '6848c6', '7f5cd5', '956fe3', 'a980f0', 'bc90fc'],
  ['000094', '181aa7', '2d32b8', '4248c8', '545cd6', '656fe4', '7580f0', '8490fc'],
  ['001c88', '183b9d', '2d57b0', '4272c2', '548ad2', '65a0e1', '75b5ef', '84c8fc'],
  ['003064', '185080', '2d6d98', '4288b0', '54a0c5', '65b7d9', '75cceb', '84e0fc'],
  ['004030', '18624e', '2d8169', '429e82', '54b899', '65d1ae', '75e7c2', '84fcd4'],
  ['004400', '1a661a', '328432', '48a048', '5cba5c', '6fd26f', '80e880', '90fc90'],
  ['143c00', '355f18', '527e2d', '6e9c42', '87b754', '9ed065', 'b4e775', 'c8fc84'],
  ['303800', '505916', '6d762b', '88923e', 'a0ab4f', 'b7c25f', 'ccd86e', 'e0ec7c'],
  ['482c00', '694d14', '866a26', 'a28638', 'bb9f47', 'd2b656', 'e8cc63', 'fce070']
];

/** The twelve paddle inks, in order: the entry each one is, and the RGB the era file uses. */
const INKS = [
  { name: 'burnt orange', hue: 3, lum: 2, rgb: '#b55328' },
  { name: 'gold', hue: 2, lum: 5, rgb: '#d2a44a' },
  { name: 'olive yellow', hue: 1, lum: 5, rgb: '#d2d240' },
  { name: 'grass', hue: 12, lum: 4, rgb: '#5cba5c' },
  { name: 'teal', hue: 11, lum: 4, rgb: '#54b899' },
  { name: 'sky blue', hue: 9, lum: 4, rgb: '#548ad2' },
  { name: 'indigo', hue: 7, lum: 4, rgb: '#7f5cd5' },
  { name: 'violet', hue: 6, lum: 4, rgb: '#a459d0' },
  { name: 'magenta', hue: 5, lum: 4, rgb: '#c659b3' },
  { name: 'red', hue: 4, lum: 3, rgb: '#c84848' },
  { name: 'salmon', hue: 4, lum: 5, rgb: '#e46f6f' },
  { name: 'pale blue', hue: 9, lum: 7, rgb: '#84c8fc' }
];

const ERA_SRC = fs.readFileSync(path.join(ROOT, 'src', 'eras', 'era1-atari2600.js'), 'utf8');

/** The recorded fills laid onto the 2600's own 160 x 192 grid, last fill winning each pixel. */
function raster(calls, w = 800, h = 600) {
  const cols = Math.round(w / PX), rows = Math.round(h / LINE);
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  for (const [f, x, y, cw, ch] of calls) {
    const c0 = Math.max(0, Math.ceil(x / PX - 0.5)), c1 = Math.min(cols - 1, Math.ceil((x + cw) / PX - 0.5) - 1);
    const r0 = Math.max(0, Math.ceil(y / LINE - 0.5)), r1 = Math.min(rows - 1, Math.ceil((y + ch) / LINE - 0.5) - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r][c] = String(f).toLowerCase();
  }
  return grid;
}

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

test('the ball is the picture chip\'s ball: 2 pixels by 4 lines, in the playfield\'s colour, hidden while the serve waits', () => {
  const g = midRally();
  const balls = frame(g).filter(([f, , , w, h]) => f === BALL_INK && w === 2 * PX && h === 4 * LINE);
  assert.strictEqual(balls.length, 1);
  const [, x, y, w, h] = balls[0];
  assert.strictEqual(w, 2 * PX); assert.strictEqual(h, 4 * LINE);
  assert.ok(Math.abs(x + w / 2 - (g.ball.x + g.ball.size / 2)) <= PX, 'centred on the ball across');
  assert.ok(Math.abs(y + h / 2 - (g.ball.y + g.ball.size / 2)) <= LINE, 'and down');
  g.serveDelay = 0.5;
  assert.strictEqual(frame(g).filter(([f, , , w, h]) => f === BALL_INK && w === 2 * PX && h === 4 * LINE).length, 0);
});

test('item 1287: the twelve inks are real entries of the 2600\'s NTSC palette, named by hue and luminance in the file', () => {
  const lit = /var PADDLE_INKS = \[([\s\S]*?)\];/.exec(ERA_SRC)[1].split('\n').filter((l) => /'#[0-9a-f]{6}'/.test(l));
  assert.strictEqual(lit.length, 12);
  assert.strictEqual(INKS.length, Pong.RULES.paletteSize, 'RULES.paletteSize stays 12');
  const palette = R.eraLook(1).palette;
  assert.strictEqual(palette.length, Pong.RULES.paletteSize, 'every ink passes the legibility check');
  INKS.forEach((ink, i) => {
    assert.strictEqual('#' + NTSC[ink.hue][ink.lum], ink.rgb, ink.name + ' is NTSC hue ' + ink.hue + ' luminance ' + ink.lum);
    assert.strictEqual(palette[i], ink.rgb, ink.name + ' is the ink the file uses');
    assert.ok(R.isLegible(ink.rgb), ink.name + ' is legible on black');
    assert.ok(lit[i].includes("'" + ink.rgb + "'") && lit[i].includes('hue ' + ink.hue + ', luminance ' + ink.lum),
      ink.name + ' is named by hue and luminance in the file: ' + lit[i].trim());
  });
  const every = new Set(NTSC.flat().map((c) => '#' + c));
  for (const c of palette) assert.ok(every.has(c), c + ' is on the NTSC table');
  assert.ok(every.has(PLAYFIELD), 'the playfield (and so the ball) is an NTSC entry too');
  assert.strictEqual(new Set(palette).size, 12, 'twelve different inks');
  assert.ok(!palette.includes(PLAYFIELD), 'no paddle ink is the ball\'s colour');
  assert.ok(/Stella/.test(ERA_SRC) && /ourNTSCPalette/.test(ERA_SRC), 'the file names its source');
});

test('item 1287: every scanline of the recorded frame carries at most four colours (COLUBK, COLUPF, COLUP0, COLUP1)', () => {
  const saved = globalThis.Pong;
  globalThis.Pong = Pong;
  const orig = Pong.isMatchPoint;
  try {
    let frames = 0;
    const walk = (g, label) => {
      const inks = new Set([R.FIELD_INK, PLAYFIELD, R.paddleInk(g, 'left'), R.paddleInk(g, 'right')].map((c) => c.toLowerCase()));
      // The era's own frame. The figures over it are the rig's sheets, each one
      // colour, its paddle's ink (item 1278's test above holds every sheet to
      // that); under node the PNGs never load and the rig draws a skin-and-body
      // placeholder the page never shows once they have, so it is left out.
      const rec = eralooks.recorder();
      R.eraLook(1).draw(rec.ctx, g, undefined, R);
      raster(rec.calls).forEach((row, r) => {
        const seen = new Set(row.filter(Boolean));
        assert.ok(seen.size <= 4, label + ': line ' + r + ' carries ' + seen.size + ' colours: ' + [...seen].join(' '));
        for (const c of seen) assert.ok(inks.has(c), label + ': line ' + r + ' has ' + c + ', none of the four registers');
      });
      frames += 1;
    };
    for (const rng of [0.1, 0.5, 0.93, 0.3]) {
      const g = midRally(rng);
      g.score.left = 10; g.score.right = 7;
      g.rally = 4; g.time = 3;
      g.events = [{ type: 'paddle', side: 'left', time: 2.9 }, { type: 'paddle', side: 'right', time: 3 }];
      // The ball through every line it can reach, from the top wall through the stand to the bottom wall.
      for (let y = 0; y + g.ball.size <= g.height; y += LINE) {
        g.ball.y = y; g.ball.x = 150 + (y % 500);
        g.time += 1 / 60;
        walk(g, 'rng ' + rng + ' ball at ' + y);
      }
      g.events = [{ type: 'score', side: 'right', time: g.time }];
      walk(g, 'rng ' + rng + ' on a point');
      Pong.isMatchPoint = () => true;
      g.time = 7; walk(g, 'rng ' + rng + ' match point');
      Pong.isMatchPoint = orig;
    }
    assert.ok(frames > 700, 'walked ' + frames + ' frames');
  } finally { Pong.isMatchPoint = orig; globalThis.Pong = saved; }
});

test('item 1287: the stand shares the playfield colour, so a line where the ball crosses it adds nothing (the ball reaches every line)', () => {
  const g = midRally();
  g.ball.y = 0; g.ball.vy = -300;
  Pong.step(g, 1 / 30, { left: null, right: null });
  assert.ok(g.ball.y < 12 * LINE, 'the rules let the ball into the stand\'s lines (4 to 22)');
  const calls = frame(midRally());
  const stand = calls.filter(([, , y, w, h]) => w === 4 * PX && h === 6 * LINE && y < 80);
  assert.ok(stand.length > 0 && stand.every(([f]) => f === PLAYFIELD), 'the stand is COLUPF');
  const walls = calls.filter(([, x, , w, h]) => x === 0 && w === 800 && h === 4 * LINE);
  assert.ok(walls.length === 2 && walls.every(([f]) => f === PLAYFIELD), 'the wall is COLUPF');
  const ball = calls.filter(([, , , w, h]) => w === 2 * PX && h === 4 * LINE);
  assert.deepStrictEqual(ball.map(([f]) => f), [PLAYFIELD], 'and so is the ball');
});

test('item 1287: score mode -- the left digits in the left player\'s ink, the right digits in the right\'s', () => {
  const g = midRally(0.93);
  g.score.left = 8; g.score.right = 8;
  const calls = frame(g);
  const digits = (ink) => calls.filter(([f, , y, w, h]) => f === ink && w === 4 * PX && h === 4 * LINE && y < 110);
  const L = digits(R.paddleInk(g, 'left')), Rt = digits(R.paddleInk(g, 'right'));
  assert.notStrictEqual(R.paddleInk(g, 'left'), R.paddleInk(g, 'right'), 'this rng gives two inks');
  assert.ok(L.length > 0 && L.every(([, x]) => x + 4 * PX <= 400), 'left digits in the left half');
  assert.ok(Rt.length > 0 && Rt.every(([, x]) => x >= 400), 'right digits in the right half');
});

test('item 1287: the wall and the stand are the 2600\'s playfield -- 40 blocks of 4 pixels, the right half the left reflected', () => {
  const g = midRally();
  for (const t of [10, 10 + 16 / 60, 20.03]) {
    g.time = t;
    const grid = raster(frame(g).filter(([f, , , w, h]) => f === PLAYFIELD && w !== PX && !(w === 2 * PX && h === 4 * LINE)));
    // The wall (lines 0-3 and 188-191) and the stand (lines 4-21) only; the net is a one-pixel column, not playfield.
    for (const r of [...Array(22).keys(), 188, 189, 190, 191]) {
      const bits = grid[r].map((c) => (c ? 1 : 0));
      for (let b = 0; b < 40; b++) {
        const block = bits.slice(b * 4, b * 4 + 4);
        assert.ok(block.every((v) => v === block[0]), 'line ' + r + ' block ' + b + ' is whole: ' + block.join(''));
      }
      assert.deepStrictEqual(bits.slice(80), bits.slice(0, 80).reverse(), 'line ' + r + ' is reflected about the centre');
    }
  }
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
