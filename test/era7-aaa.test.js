'use strict';
/*
 * Era 7 as a AAA game of 1999 that happens to be Pong (item 1231, docs/ART.md
 * era 7): two skaters hold the paddles, the table sits on a sunset rooftop with
 * posters, a water tower, window lights and a blimp, and the score wears spray
 * tags, spray cans, a paint splat and a match-point sky. Headless, on a
 * context that logs fills and strokes.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const C = require('../src/characters.js');
const T = R.table3d;
const look = R.eraLook(7);

function logCtx() {
  const ops = [];
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter',
    beginPath() { ops.push({ op: 'begin' }); },
    moveTo(x, y) { ops.push({ op: 'move', x, y }); },
    lineTo(x, y) { ops.push({ op: 'line', x, y }); },
    arc(x, y, r) { ops.push({ op: 'arc', x, y, r }); },
    stroke() { ops.push({ op: 'stroke', style: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha }); },
    fill() { ops.push({ op: 'fill', style: this.fillStyle, alpha: this.globalAlpha }); },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', style: this.fillStyle, x, y, w, h, alpha: this.globalAlpha }); },
    closePath() {}, save() {}, restore() {}, translate() {}, scale() {},
    createLinearGradient() { return { stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; }
  };
  return { ctx, ops };
}

function game(opts) {
  const g = Pong.createGame(Object.assign({ rng: () => 0.1, phase: 'playing', era: 7 }, opts || {}));
  g.serveDelay = 0;
  return g;
}

const draw = (g) => { const log = logCtx(); look.draw(log.ctx, g, null, R); return log.ops; };

test('two different skaters hold the paddles, from the cut sheets, with all six rows of frames', () => {
  const left = C.configFor(7, 'left'), right = C.configFor(7, 'right');
  assert.strictEqual(left.sheet, 'era7-skater-left-sheet');
  assert.strictEqual(right.sheet, 'era7-skater-right-sheet');
  assert.ok(left.is3d, 'a depth-scaled billboard on the table');
  assert.strictEqual(left.fps, 10, 'sharp held poses at 10 a second');
  assert.strictEqual(left.anchor.dz, 24, 'the hand on the paddle box\'s top');
  assert.strictEqual(left.hand.x, left.frame.w, 'the hand on the edge that meets the paddle');
  // About 90 table units tall, as the bible sizes every 3D player.
  assert.ok(Math.abs(left.frame.h * left.scale - 109) < 2 && 68 * left.scale > 85 && 68 * left.scale < 95);
  for (const name of [left.sheet, right.sheet]) {
    const png = fs.readFileSync(path.join(ROOT, 'assets', 'pixellab', name + '.png'));
    // PNG IHDR: width and height, big-endian, at bytes 16 and 20.
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    const cols = Math.max(...C.BEATS.map((b) => left.frames[b]));
    assert.deepStrictEqual([w, h], [left.frame.w * cols, left.frame.h * C.BEATS.length], name + ' is the rig\'s six rows');
  }
  // All five beats are drawn: every row of the default frames has frames.
  for (const b of C.BEATS) assert.ok(left.frames[b] > 0, b);
});

test('the rooftop: three posters, twelve window lights on their own periods, a water tower and a blimp at 12 a second', () => {
  assert.strictEqual(look.SCENE.posters.length, 3);
  for (const p of look.SCENE.posters) {
    assert.ok([look.PALETTE.magenta, look.PALETTE.cyan, look.PALETTE.yellow].includes(p.bg), 'a flat poster colour');
  }
  assert.deepStrictEqual([look.SCENE.poster.w, look.SCENE.poster.h], [60, 30]);
  assert.strictEqual(look.WINDOWS.length, 12);
  for (const w of look.WINDOWS) assert.ok(w.period >= 0.5 && w.period <= 2, 'toggles every 0.5 to 2 s');
  // Each window really toggles, and they do not all toggle together.
  const flips = look.WINDOWS.map((w, i) => look.windowLit(i, 1) !== look.windowLit(i, 1 + w.period));
  assert.ok(flips.every(Boolean), 'each window flips after its period');
  const lit = (t) => look.WINDOWS.map((w, i) => look.windowLit(i, t)).join();
  assert.notStrictEqual(lit(3), lit(3.3));
  assert.deepStrictEqual([look.SCENE.tower.x, look.SCENE.tower.y, look.SCENE.tower.w], [700, -80, 40]);
  assert.strictEqual(look.blimpX(10) - look.blimpX(0), 120, '12 units a second');
  assert.ok(look.blimpX(0) <= -look.SCENE.blimp.w + 1e-9, 'it starts wholly off the left edge');
  const lap = (800 + look.SCENE.blimp.w) / 12;
  assert.ok(Math.abs(look.blimpX(lap - 0.01) - 800) < 1, 'and goes round once wholly off the right');
  // It moves on its own: two frames a second apart differ.
  const a = draw(game({})), g = game({}); g.time = 1;
  assert.notDeepStrictEqual(a, draw(g));
});

test('no gradients and no paper white in the scene: the ball stays the only white (R1)', () => {
  const g = game({});
  g.time = 20; g.rally = 9;
  const ops = draw(g);
  const whites = ops.filter((o) => (o.op === 'fill' || o.op === 'fillRect') && o.style === '#ffffff');
  assert.strictEqual(whites.length, 1, 'only the ball');
});

test('the score: P1 and CPU tags beside the numbers, three cans filling one per three hits, all above R8\'s line', () => {
  assert.deepStrictEqual([0, 2, 3, 5, 6, 9, 40].map(look.cansFilled), [0, 0, 1, 1, 2, 3, 3]);
  const cam = T.camera(look.camera);
  const limit = T.project(cam, 400, 0, 0).y - 6;
  for (const side of ['left', 'right']) {
    for (const n of [0, 7, 10, 99]) {
      const number = look.graffiti(R, n, side === 'left' ? 280 : 520, side);
      const at = look.tagCentre(R, number, side);
      assert.strictEqual(at.text, side === 'left' ? 'P1' : 'CPU');
      const tag = look.tagCells(R, at.text, at.cx);
      assert.ok(look.tagBottom(tag) <= limit, `${side} tag at score ${n} stays above y ${limit.toFixed(1)}`);
      assert.ok(look.HUD.can.top + look.HUD.can.h <= limit, 'the cans too');
      // Beside the number, never over it.
      const numL = number.cx - number.width / 2, numR = number.cx + number.width / 2;
      const tagL = at.cx - tag.width / 2, tagR = at.cx + tag.width / 2;
      assert.ok(tagR <= numL || tagL >= numR, `${side} tag clear of its number at ${n}`);
    }
  }
  const g = game({}); g.rally = 6; g.time = 5;
  const cyan = draw(g).filter((o) => o.op === 'fill' && o.style === look.PALETTE.cyan);
  assert.ok(cyan.length >= 2, 'both tags drawn in poster cyan');
});

test('a point stamps a magenta splat behind the scorer\'s number, fading over 1.2 s, and the blimp flashes the score', () => {
  assert.strictEqual(look.splatAlpha(0), 1);
  assert.ok(look.splatAlpha(0.6) > 0.4 && look.splatAlpha(0.6) < 0.6);
  assert.strictEqual(look.splatAlpha(1.2), 0);
  const pts = look.splatShape(300, 30, 11);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 90 && Math.max(...ys) - Math.min(...ys) <= 60, 'at most 90 x 60');

  const g = game({});
  g.time = 30;
  draw(g);                                       // the file sees 0-0
  const splats = (ops) => ops.filter((o) => o.op === 'fill' && o.style === look.PALETTE.magenta && o.alpha < 1 + 1e-9 && o.alpha > 0);
  const before = splats(draw(g)).length;
  g.score.left = 1; g.time = 30.1;
  const ops = draw(g);
  assert.ok(splats(ops).length > before, 'the splat is drawn');
  // The blimp's panel shows the score in ink with yellow block digits.
  assert.ok(ops.some((o) => o.op === 'fillRect' && o.style === look.PALETTE.ink && o.w === 36), 'the panel turns ink');
  g.time = 31.5;
  const late = draw(g);
  assert.ok(!late.some((o) => o.op === 'fillRect' && o.style === look.PALETTE.ink && o.w === 36), 'back to its stripes after 1 s');
});

test('match point swaps the sky (magenta on top) and blinks the tags 4 times a second', () => {
  assert.deepStrictEqual(look.skyOrder(false), look.PALETTE.sky);
  assert.deepStrictEqual(look.skyOrder(true), look.PALETTE.sky.slice().reverse());
  assert.strictEqual(look.tagsShown(false, 0.13), true);
  const shown = [];
  for (let t = 0; t < 1; t += 0.0625) shown.push(look.tagsShown(true, t));
  const flips = shown.filter((v, i) => i && v !== shown[i - 1]).length;
  assert.ok(flips >= 7 && flips <= 8, `4 blinks a second (${flips} flips)`);
  // Drawn: at match point the first band painted is magenta.
  const g = game({ matchPoints: 11 });
  g.score.left = 5; g.score.right = 5;
  if (Pong.isMatchPoint(g)) {
    const first = draw(g).find((o) => o.op === 'fillRect' && look.PALETTE.sky.includes(o.style));
    assert.strictEqual(first.style, look.PALETTE.magenta);
  }
});

test('the arrival flourish still plays for era 7, and the rules are untouched by every new piece', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  const g = game({}); g.time = 12; g.score.left = 3; g.rally = 7;
  const before = JSON.stringify(g, (k, v) => (k === 'rng' ? undefined : v));
  draw(g);
  assert.strictEqual(JSON.stringify(g, (k, v) => (k === 'rng' ? undefined : v)), before);
});
