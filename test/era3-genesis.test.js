'use strict';
/*
 * Era 3, the 1989 Sega Genesis look (src/eras/era3-genesis.js), checked on the
 * recording canvas from tools/eralooks.js: headless, no browser.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const { Pong, R } = eralooks.loadRenderer(path.join(__dirname, '..'));
const look = R.eraLook(3);

/** A Genesis game mid-rally, the ball flying right and up. */
function rally() {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 3 });
  g.serveDelay = 0;
  g.time = 12.5;
  g.score.left = 3;
  g.score.right = 1;
  g.ball.x = 300;
  g.ball.y = 200;
  g.ball.vx = 420;
  g.ball.vy = -160;
  g.left.y = 120;
  g.right.y = 330;
  return g;
}

function drawn(g, opts) {
  const rec = eralooks.recorder();
  R.draw(rec.ctx, g, opts);
  return rec.calls;
}

test('era 3 is the Genesis look now, not a placeholder', () => {
  assert.strictEqual(look.era, 3);
  assert.strictEqual(look.name, '1989 Sega Genesis');
  assert.ok(!look.placeholder);
  assert.strictEqual(typeof look.draw, 'function');
  assert.notDeepStrictEqual(drawn(rally()), (() => { const g = rally(); g.era = 1; return drawn(g); })());
});

test('every colour it paints is on the Genesis 512-colour palette', () => {
  const calls = drawn(rally());
  assert.ok(calls.length > 200, `a real frame (${calls.length} rectangles)`);
  const levels = new Set(look.LEVELS);
  for (const [ink] of calls) {
    let rgb;
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(ink);
    const rgba = /^rgba\((\d+),(\d+),(\d+),[\d.]+\)$/.exec(ink);
    if (hex) rgb = hex.slice(1).map((h) => parseInt(h, 16));
    else if (rgba) rgb = rgba.slice(1).map(Number);
    else assert.fail(`${ink} is not a colour this era writes`);
    for (const v of rgb) assert.ok(levels.has(v), `${ink} is off the palette`);
  }
});

test('the paddles are gradient-shaded, in their own colours, with a shadow', () => {
  const g = rally();
  const calls = drawn(g);
  for (const side of ['left', 'right']) {
    const p = g[side];
    const inside = calls.filter(([, x, y, w, h]) =>
      x >= p.x && y >= p.y && x + w <= p.x + p.w + 1e-9 && y + h <= p.y + p.h + 1e-9);
    const shades = new Set(inside.map((c) => c[0]));
    assert.ok(shades.size >= 4, `${side} paddle painted in ${shades.size} shades`);
    assert.ok(shades.has(look.paddleInk(g, side)), `${side} paddle wears its own colour`);
    assert.ok(calls.some(([ink, x, y]) => ink === look.SHADOW && x === p.x + 5 && y === p.y + 5),
      `${side} paddle casts a shadow`);
  }
  assert.notStrictEqual(look.paddleInk(g, 'left'), look.paddleInk(g, 'right'));
});

test('the ball leaves a fading trail back along its flight, and none while the serve waits', () => {
  const trailOf = (g) => drawn(g).filter(([ink]) => ink.startsWith(`rgba(${look.TRAIL_INK},`));
  const g = rally();
  const centre = g.ball.x + g.ball.size / 2;
  const right = trailOf(g);
  assert.strictEqual(right.length, look.TRAIL);
  for (const [, x, , w] of right) assert.ok(x + w / 2 < centre, 'flying right, the trail is to the left');
  const alphas = right.map(([ink]) => Number(/,([\d.]+)\)$/.exec(ink)[1]));
  assert.deepStrictEqual([...alphas].sort((a, b) => a - b), alphas, 'fainter the further back');

  g.ball.vx = -420;
  for (const [, x, , w] of trailOf(g)) assert.ok(x + w / 2 > centre, 'flying left, the trail is to the right');

  g.serveDelay = 0.5;
  assert.strictEqual(trailOf(g).length, 0);
});

test('the score is bolder than the stock frame and drops a shadow', () => {
  const g = rally();
  const calls = drawn(g);
  const cell = look.SCORE.cell;
  assert.ok(cell > 14, 'bigger blocks than the 14-unit stock score');
  const ink = look.paddleInk(g, 'left');
  const blocks = calls.filter(([c, x, y, w]) => c === ink && w === cell && y < 150);
  assert.ok(blocks.length >= 7, `the left score's blocks (${blocks.length})`);
  for (const [, x, y] of blocks) {
    const s = look.SCORE.shadow;
    assert.ok(calls.some(([c, sx, sy, sw]) => c === look.SHADOW && sx === x + s && sy === y + s && sw === cell),
      `a shadow under the block at ${x},${y}`);
  }
});

test('two background planes scroll slowly with game time, the near one faster', () => {
  const far = (look.planes(10).far - look.planes(0).far) / 10;
  const near = (look.planes(10).near - look.planes(0).near) / 10;
  assert.ok(far > 0, 'the far plane moves');
  assert.ok(near > far * 2, 'the near plane moves well faster: parallax');
  assert.ok(near <= 30, `slowly: ${near} units a second`);
  const a = rally();
  const b = rally();
  b.time += 3;
  assert.notDeepStrictEqual(drawn(a), drawn(b), 'three seconds later the frame has scrolled');
});

test('drawing never touches the state, so the game plays exactly as it did', () => {
  const g = rally();
  const before = JSON.stringify(g);
  drawn(g);
  assert.strictEqual(JSON.stringify(g), before);

  // Ten seconds of the same play, one drawn every frame and one never drawn.
  let seedA = 7;
  let seedB = 7;
  const lcg = (s) => () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const shown = Pong.createGame({ rng: lcg(seedA), phase: 'playing', era: 3 });
  const unseen = Pong.createGame({ rng: lcg(seedB), phase: 'playing', era: 3 });
  for (let f = 0; f < 600; f++) {
    Pong.step(shown, 1 / 60, { pointerY: shown.ball.y, up: false, down: false });
    Pong.step(unseen, 1 / 60, { pointerY: unseen.ball.y, up: false, down: false });
    drawn(shown);
  }
  assert.strictEqual(JSON.stringify(shown), JSON.stringify(unseen));
});

test('the attract rally behind the title stays the stock dimmed frame', () => {
  const g = rally();
  const rec = eralooks.recorder();
  R.drawBase(rec.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(drawn(g, { ink: '#3a3a3a' }), rec.calls);
});
