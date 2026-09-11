'use strict';
/*
 * Era 8's arrival flourish (src/eras/era8-ps2.js, item 1154): the change into
 * the PlayStation 2 plays as the bible's three beats -- the letterbox bars slide
 * in and the colour drains through the ring; the boot towers rise on the ring's
 * edge with the first sparks and dust spilling outward; then the flare sweeps
 * home and the bars settle to the era's own -- under the voice's boot sting,
 * which the sound player plays, never the flourish. Headless: the recording
 * canvas is extended here to log fills, rects and strokes with the composite
 * in force; the browser half is docs/shots/item-1154/.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');
const Sound = require('../src/sound.js');

const FRAME = 1 / 60;
const look = R.eraLook(8);
const A = look.ARRIVAL;

function concede(g, y) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y === undefined ? g.height / 2 : y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = g.ball.y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
}

function era7Game() {
  return Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 7 });
}

/** The recorder, plus a log of every fill, rect and stroke with the ink and composite in force. */
function frame(g, opts) {
  const rec = eralooks.recorder();
  const log = [];
  const ctx = rec.ctx;
  const ink = (s) => (typeof s === 'string' ? s : 'gradient');
  ctx.fill = function () { log.push(['fill', ink(this.fillStyle), this.globalCompositeOperation || 'source-over', this.globalAlpha]); };
  ctx.fillRect = function (x, y, w, h) { log.push(['rect', ink(this.fillStyle), this.globalCompositeOperation || 'source-over', this.globalAlpha, x, y, w, h]); };
  ctx.stroke = function () { log.push(['stroke', ink(this.strokeStyle), this.globalCompositeOperation || 'source-over', this.globalAlpha]); };
  R.drawEraFrame(ctx, g, opts);
  return log;
}

/** Only what the flourish adds: the same frame with the hook taken away, subtracted by count. */
function flourishOnly(g, opts) {
  const withHook = frame(g, opts);
  const hook = look.flourish;
  delete look.flourish;
  let plain;
  try { plain = frame(g, opts); } finally { look.flourish = hook; }
  const left = new Map();
  for (const c of plain) { const k = JSON.stringify(c); left.set(k, (left.get(k) || 0) + 1); }
  return withHook.filter((c) => {
    const k = JSON.stringify(c);
    const n = left.get(k) || 0;
    if (n > 0) { left.set(k, n - 1); return false; }
    return true;
  });
}

function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (extra) => Object.assign({ connect(to) { return to; } }, extra);
  return class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = node({}); }
    createOscillator() { return node({ type: 'sine', frequency: param(), start() {}, stop() {} }); }
    createGain() { return node({ gain: param() }); }
    createDelay() { return node({ delayTime: param() }); }
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); }
  };
}

function stepTo(g, p) {
  for (let i = 0; i < 200; i++) {
    const m = R.eraChangeMoment(g);
    if (m && m.wiping && m.p >= p) return m;
    Pong.step(g, FRAME, {});
  }
  throw new Error(`the ring never reached p ${p}`);
}

const bars = (log) => log.filter((c) => c[0] === 'rect' && c[1] === '#000000' && c[4] === 0 && c[6] === 800);
const towers = (log) => log.filter((c) => c[0] === 'rect' && c[2] === 'lighter');

test('era 8 registers the PlayStation 2 arrival on its own look, and a borrowed look borrows none of it', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  assert.notStrictEqual(look.flourish, R.eraLook(1).flourish);
  assert.notStrictEqual(look.flourish, R.eraLook(7).flourish);
  const g = era7Game();
  concede(g);
  const log = [];
  const ctx = eralooks.recorder().ctx;
  ctx.stroke = ctx.fill = () => log.push(1);
  ctx.fillRect = () => log.push(1);
  look.flourish(ctx, 0.5, { x: 0, y: 300 }, 8, 9, { radius: 400, width: 800, height: 600, state: g, dim: null });
  assert.strictEqual(log.length, 0);
});

test('the plan: bars 0 to 70 in beat 1, held, settling to 52; eighteen towers rising in turn on the edge', () => {
  const o = { x: 0, y: 300 };
  const plan = (p, r) => look.arrivalPlan(p, o, r, { x: 150, y: 40 });
  assert.strictEqual(plan(0, 0).bars, 0);
  assert.ok(plan(0.1, 50).bars > 0 && plan(0.1, 50).bars < 70, 'sliding in');
  assert.strictEqual(plan(0.25, 200).bars, 70);
  assert.strictEqual(plan(0.6, 500).bars, 70);
  assert.ok(Math.abs(plan(1, 1040).bars - 52) < 1e-9, 'settled on the era\'s own bars');
  assert.deepStrictEqual([plan(0.1, 50).beat, plan(0.5, 400).beat, plan(0.9, 900).beat], [1, 2, 3]);
  // Towers: none in beat 1, a few early in beat 2, all eighteen by the end of it, none in beat 3.
  assert.strictEqual(plan(0.2, 150).towers.length, 0);
  const early = plan(0.3, 250).towers.length, late = plan(0.78, 700).towers.length;
  assert.ok(early > 0 && early < late, `${early} towers early, ${late} late`);
  assert.strictEqual(plan(0.9, 900).towers.length, 0);
  // Each stands on the ring's edge, 10 wide, no taller than 140, never over 60 past the ring.
  for (const r of [250, 450, 700]) {
    for (const tw of plan(0.7, r).towers) {
      const bx = tw.x + tw.w / 2;
      assert.ok(Math.abs(Math.hypot(bx - o.x, tw.base - o.y) - r) < 1e-6, 'its foot on the edge');
      assert.strictEqual(tw.w, 10);
      assert.ok(tw.h <= A.towers.hMax + 1e-9);
      assert.ok(Math.hypot(bx - o.x, tw.y - o.y) <= r + 60 + 1e-6, 'its top within 60 of the ring');
    }
  }
  // The flare: absent until beat 3, then from the miss to the resting light.
  assert.strictEqual(plan(0.7, 700).flare, null);
  assert.deepStrictEqual([plan(0.8, 850).flare.x, plan(0.8, 850).flare.y], [0, 300]);
  const home = plan(1, 1040).flare;
  assert.ok(Math.abs(home.x - 150) < 1e-9 && Math.abs(home.y - 40) < 1e-9 && home.alpha < 1e-9);
});

test('the change from era 7 plays all three beats, each on its own frames', () => {
  const g = era7Game();
  concede(g, 200);
  assert.strictEqual(g.era, 8);

  stepTo(g, 0.12);
  const one = flourishOnly(g);
  assert.strictEqual(bars(one).length, 2, 'the bars, top and bottom');
  assert.ok(bars(one)[0][7] > 0 && bars(one)[0][7] < 70, 'still sliding in');
  assert.ok(one.some((c) => c[0] === 'fill' && c[2] === 'saturation'), 'the colour drains');
  assert.strictEqual(towers(one).length, 0, 'no towers yet');

  stepTo(g, 0.55);
  const two = flourishOnly(g);
  assert.ok(towers(two).length >= 6, `${towers(two).length} boot towers glowing`);
  assert.deepStrictEqual(bars(two).map((c) => c[7]), [70, 70], 'the bars held at 70');
  assert.ok(two.some((c) => c[0] === 'fill' && c[2] === 'saturation'), 'the cross-fade band');
  assert.ok(two.some((c) => c[0] === 'rect' && c[1] === '#d8d0c0'), 'dust spilling from the edge');
  assert.ok(two.some((c) => c[0] === 'stroke' && c[2] === 'lighter'), 'the first sparks');

  stepTo(g, 0.85);
  const three = flourishOnly(g);
  assert.strictEqual(towers(three).length, 0, 'the towers have gone');
  assert.ok(three.some((c) => c[0] === 'fill' && c[1] === 'gradient' && c[2] === 'lighter'), 'the flare sweeping home');
  const h = bars(three)[0][7];
  assert.ok(h < 70 && h > 52, `the bars settling (${h.toFixed(1)})`);
});

test('nothing but the bars strays more than 60 pixels past the ring', () => {
  const g = era7Game();
  concede(g, 420);
  for (const p of [0.3, 0.45, 0.6, 0.75]) {
    const m = stepTo(g, p);
    const plan = look.arrivalPlan(m.p, m.origin, m.radius, null);
    for (const tw of plan.towers) {
      for (const [x, y] of [[tw.x, tw.y], [tw.x + tw.w, tw.y], [tw.x, tw.base], [tw.x + tw.w, tw.base]]) {
        assert.ok(Math.hypot(x - m.origin.x, y - m.origin.y) <= m.radius + 60 + 6, `a tower corner past the ring at p ${p}`);
      }
    }
    for (const mo of plan.motes) assert.ok(Math.hypot(mo.x - m.origin.x, mo.y - m.origin.y) <= m.radius + 60);
    for (const s of plan.sparks) assert.ok(Math.hypot(s.x1 - m.origin.x, s.y1 - m.origin.y) <= m.radius + 60);
  }
});

test('it ends inside the serve pause, the paddles stay in the player\'s hands, and the state is untouched', () => {
  const g = era7Game();
  concede(g);
  let lastRing = null;
  let pointer = 100;
  for (let i = 0; i < 200; i++) {
    const m = R.eraChangeMoment(g);
    if (m && m.wiping) {
      const before = JSON.stringify(g);
      frame(g); frame(g);
      assert.strictEqual(JSON.stringify(g), before, 'drawing changes nothing');
      lastRing = { serveDelay: g.serveDelay };
    }
    const y0 = g.left.y;
    pointer = pointer === 100 ? 500 : 100;
    Pong.step(g, FRAME, { pointerY: pointer });
    if (m && m.wiping) assert.notStrictEqual(g.left.y, y0, 'the paddle follows the hand during the ring');
    if (g.serveDelay <= 0) break;
  }
  assert.ok(lastRing && lastRing.serveDelay > 0, 'the last ring frame is still inside the serve pause');
  const after = frame(g);
  assert.strictEqual(towers(after).length, 0, 'once the ring has gone, no flourish');
});

test('behind the title the plain ring plays, with no flourish', () => {
  const rally = era7Game();
  concede(rally);
  stepTo(rally, 0.5);
  assert.deepStrictEqual(flourishOnly(rally, { ink: '#3a3a3a', card: false }), []);
});

test('the sound: the PlayStation 2 boot swell is the point\'s sting, played once, from the voice and not the flourish', () => {
  const boot = Sound.voicesFor(8, 'boot');
  assert.ok(boot.length >= 5);
  assert.ok(boot.some((v) => v.wave === 'sawtooth' && v.freq === 55), 'the low swelling drone');
  assert.ok(boot.some((v) => v.wave === 'sine' && v.freq >= 1700 && (v.at || 0) >= 1.2), 'the crystal twinkles');
  const player = Sound.createPlayer({ AudioContext: fakeAudio() });
  player.unlock();
  const g = era7Game();
  concede(g);
  player.handle(g);
  assert.strictEqual(player.last.type, 'boot');
  assert.strictEqual(player.last.era, 8);
  for (let i = 0; i < 100; i++) { frame(g); frame(g); Pong.step(g, FRAME, {}); player.handle(g); }
  assert.strictEqual(player.boots, 1, 'once for the whole ring');
  assert.strictEqual(player.errors, 0);
});

test('the era file never reaches for sound and never walks pixels', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'eras', 'era8-ps2.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/PongSound|__pongSound|VOICES|\.play\s*\(/.test(code));
  assert.ok(!/getImageData|putImageData/.test(code));
  assert.ok(!/^\s*(import|export)\s/m.test(code), 'no ES modules');
});
