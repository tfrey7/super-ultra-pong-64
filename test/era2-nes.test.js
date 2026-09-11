'use strict';
/*
 * Era 2 -- the 1985 NES look (src/eras/era2-nes.js).
 *
 * Its own file, so the era cards running beside it never edit the same lines.
 * Every frame is recorded headless as [fillStyle, x, y, w, h] calls.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const NES_LOOK = () => R.eraLook(2);

/** A pinned mid-rally state at the given era, colours already picked. */
function midRally(era, rng = 0.1) {
  const g = Pong.createGame({ rng: () => rng, phase: 'playing', era });
  g.score.left = 3;
  g.score.right = 11;
  g.serveDelay = 0;
  g.ball.x = 612.5;
  g.ball.y = 297.25;
  // below the stands (item 1225: the band and the crowd fill the top 84 units)
  g.left.y = 140;
  g.right.y = 390;
  return g;
}

function frame(g, opts) {
  const rec = eralooks.recorder();
  R.draw(rec.ctx, g, opts);
  return rec.calls;
}

/** Calls drawn inside a box, allowing one sprite pixel of overhang and shadow. */
function within(calls, box, slack = 5) {
  const bw = box.w !== undefined ? box.w : box.size;   // the ball is a square of `size`
  const bh = box.h !== undefined ? box.h : box.size;
  return calls.filter(([, x, y, w, h]) =>
    x >= box.x - slack && y >= box.y - slack &&
    x + w <= box.x + bw + slack && y + h <= box.y + bh + slack);
}

const inksOf = (calls) => new Set(calls.map((c) => c[0]));

test('era 2 is a real look now: its own frame, not a placeholder borrowing era 1', () => {
  const look = NES_LOOK();
  assert.strictEqual(look.era, 2);
  assert.strictEqual(look.name, '1985 NES');
  assert.ok(!look.placeholder, 'no longer a placeholder');
  assert.strictEqual(look.like, undefined, 'borrows nothing from era 1');
  assert.strictEqual(typeof look.draw, 'function', 'takes over the whole frame');
});

test('at a glance a different machine: a tiled court, not the black field of eras 0 and 1', () => {
  const nes = frame(midRally(2));
  const one = midRally(2);
  one.era = 1;
  assert.notDeepStrictEqual(nes, frame(one), 'era 2 does not draw era 1');
  const [ink, x, y, w, h] = nes[0];
  assert.deepStrictEqual([x, y, w, h], [0, 0, 800, 600], 'the frame opens by painting the court');
  assert.notStrictEqual(ink, '#000000', 'and the court is not black');
  const mortar = nes.filter(([i, , , cw, chh]) => i === '#000000' && (cw === 800 || chh === 600));
  assert.ok(mortar.length >= 30, `tiled: ${mortar.length} mortar lines`);
});

test('every colour on screen comes from the NES palette', () => {
  const pal = NES_LOOK().nesPalette;
  assert.strictEqual(pal.length, 64, 'the 2C02 has 64 entries');
  for (const c of pal) assert.match(c, /^#[0-9a-f]{6}$/);
  const serving = midRally(2);
  serving.serveDelay = 0.5;
  for (const g of [midRally(2, 0.1), midRally(2, 0.5), midRally(2, 0.93), serving]) {
    for (const [ink] of frame(g)) assert.ok(pal.includes(ink), `${ink} is not an NES colour`);
  }
});

test('paddles and ball are chunky sprites with two-tone shading', () => {
  for (const rng of [0.1, 0.5, 0.93]) {
    const g = midRally(2, rng);
    const calls = frame(g);
    for (const side of ['left', 'right']) {
      const sprite = within(calls, g[side]).filter(([, , , w, h]) => w < 800 && h < 600);
      const inks = inksOf(sprite);
      inks.delete('#000000');                       // the drop shadow
      const { body, shade } = NES_LOOK().spriteInks(g, side);
      assert.deepStrictEqual([...inks].sort(), [body, shade].sort(), `${side} paddle wears two tones`);
      assert.notStrictEqual(body, shade);
      assert.strictEqual(R.paddleInk(g, side), body, 'paddleInk is the lit tone');
      assert.ok(sprite.length >= 8, `${side} paddle is a sprite of ${sprite.length} pieces, not one bar`);
      for (const [, x, y, w, h] of sprite) {
        assert.strictEqual(x % 4, 0, 'on the sprite grid');
        assert.strictEqual(y % 4, 0, 'on the sprite grid');
        assert.strictEqual(w % 4 + h % 4, 0, 'whole sprite pixels');
      }
    }
    assert.notStrictEqual(R.paddleInk(g, 'left'), R.paddleInk(g, 'right'), 'the two sides differ');
    const ball = within(calls, g.ball, 4).filter(([, , , w, h]) => w < 800 && h < 600);
    const ballInks = inksOf(ball);
    ballInks.delete('#000000');
    ballInks.delete(NES_LOOK().nesPalette[0x38]);  // the tennis ball's seam (item 1225)
    assert.strictEqual(ballInks.size, 2, 'the ball is lit and shaded');
    assert.ok(ball.length >= 6, 'the ball is a sprite');
  }
});

test('an Atari colour becomes its NES cousin, so the machine change swaps nobody\'s colour', () => {
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const hue = (c) => {
    const [r, g, b] = hex(c).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const atari = R.eraLook(1).palette;
  for (let slot = 0; slot < atari.length; slot++) {
    const g = midRally(2);
    g.paddleColour = { left: slot, right: (slot + 1) % atari.length };
    const nes = R.paddleInk(g, 'left');
    const gap = Math.abs(hue(nes) - hue(atari[slot]));
    assert.ok(Math.min(gap, 360 - gap) <= 45, `slot ${slot}: ${atari[slot]} -> ${nes} is ${Math.round(gap)} degrees off`);
  }
});

test('the centre line is a dotted net between two posts, and the table has a border with its ends at the paddles (item 1267)', () => {
  const g = midRally(2);
  const calls = frame(g);
  const net = calls.filter(([, x, , w, h]) => x >= 394 && x + w <= 406 && w <= 12 && h <= 12);
  assert.ok(net.length >= 40, `${net.length} net pieces`);
  const dots = net.filter(([, , , w, h]) => w === 8 && h === 8).map((c) => c[2]);
  assert.ok(dots.length >= 18, `${dots.length} dots`);
  for (let i = 1; i < dots.length; i++) assert.ok(dots[i] - dots[i - 1] > 8, 'dots, not a solid line');
  assert.strictEqual(inksOf(net).size, 3, 'lit dots, their shade, and the posts');
  const has = (x, y, w, h) => calls.some((c) => c[1] === x && c[2] === y && c[3] === w && c[4] === h);
  // Realism rung 2: the border is the table's edge lines, its ends moved in to
  // the paddles' outer faces (x 32 and 768), the floor beyond them.
  assert.ok(has(24, 0, 752, 4) && has(24, 596, 752, 4), 'the table\'s side edges, top and bottom');
  assert.ok(has(24, 0, 4, 600) && has(772, 0, 4, 600), 'its end lines, just past each paddle\'s outer face');
});

test('the score is its own pixel font, drawn with a shadow, and it is the score that moves', () => {
  const font = NES_LOOK().font;
  for (let d = 0; d <= 9; d++) {
    const rows = font[String(d)];
    assert.strictEqual(rows.length, 7, `${d} is seven rows`);
    for (const row of rows) assert.match(row, /^[01]{6}$/);
    assert.notDeepStrictEqual(rows, R.DIGITS[String(d)], 'not the 1972 blocks');
  }
  const a = midRally(2);
  const b = midRally(2);
  b.score.left = 4;
  const fa = frame(a), fb = frame(b);
  assert.notDeepStrictEqual(fa, fb);
  // A 3 and a 4 are different numbers of rectangles, so compare the frames as
  // sets of calls rather than position by position.
  const key = (c) => JSON.stringify(c);
  const inA = new Set(fa.map(key)), inB = new Set(fb.map(key));
  const moved = fa.filter((c) => !inB.has(key(c))).concat(fb.filter((c) => !inA.has(key(c))));
  assert.ok(moved.length > 0);
  for (const [, , y] of moved) assert.ok(y < 44, 'only the status band at the top changed');
  // Tennis's status band (item 1225): the score in $30 over the black shadow,
  // beside P1 in the player's paddle colour.
  const band = fb.filter(([, , y, , h]) => y >= 4 && y + h <= 48);
  const pal = NES_LOOK().nesPalette;
  assert.ok(inksOf(moved).has(pal[0x30]) && inksOf(moved).has('#000000'), 'the score in white over its shadow');
  assert.ok(inksOf(band).has(R.paddleInk(a, 'left')), 'P1 in the paddle colour');
});

test('the ball blinks out while the serve waits, as in every era', () => {
  const g = midRally(2);
  const live = frame(g);
  g.serveDelay = 0.4;
  const waiting = frame(g);
  const ball = within(live, g.ball, 4).filter(([, , , w, h]) => w < 800 && h < 600);
  // the ball, its seam, and its shadow under it (item 1225) all go with it
  assert.strictEqual(live.length - waiting.length, ball.length + 1);
  assert.ok(ball.length > 0);
});

test('drawing reads the state and never changes it', () => {
  const g = midRally(2);
  const before = JSON.stringify(g);
  frame(g);
  assert.strictEqual(JSON.stringify(g), before);
});

test('a dimmed era-2 frame is the stock monochrome frame, like era 1\'s', () => {
  const g = midRally(2);
  const rec = eralooks.recorder();
  R.drawBase(rec.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(frame(g, { ink: '#3a3a3a' }), rec.calls);
});

test('plays exactly the same as era 1: same seed, same hands, same match', () => {
  // A seeded generator per game, so the serve angles and the computer's aim
  // really vary, and the two games draw the identical sequence.
  const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // eraChangePause 0: the two machines climb the ladder at different points
  // (era 1 has further to go), and the longer pause after an era change is a
  // rule about the ladder, not about the look -- this test is about the look.
  // cpuProfiles false: each era's opponent (item 1209) is a rule of the ladder too.
  const rules = { eraChangePause: 0, cpuProfiles: false };
  const one = Pong.createGame({ rng: seeded(7), phase: 'playing', era: 1, rules });
  const two = Pong.createGame({ rng: seeded(7), phase: 'playing', era: 2, rules });
  const play = (g) => ({ ball: g.ball, left: g.left, right: g.right, score: g.score,
    rally: g.rally, serveDelay: g.serveDelay, time: g.time, lastEvent: g.lastEvent });
  let points = 0;
  for (let i = 0; i < 60 * 90; i++) {
    const hand = { pointerY: 300 + Math.sin(i / 37) * 240, up: false, down: false };
    const dt = i % 7 === 0 ? 1 / 30 : 1 / 60;
    const s1 = one.score.left + one.score.right;
    Pong.step(one, dt, hand);
    Pong.step(two, dt, hand);
    if (one.score.left + one.score.right !== s1) points++;
    frame(two);                                   // drawing mid-match changes nothing either
    assert.deepStrictEqual(play(two), play(one), `diverged at step ${i}`);
  }
  assert.ok(points >= 3, `the match had ${points} points, so scoring was exercised`);
});
