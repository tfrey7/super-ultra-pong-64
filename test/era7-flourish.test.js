'use strict';
/*
 * Era 7's arrival flourish (src/eras/era7-dreamcast.js, item 1153): the change
 * into the Dreamcast plays as the bible's three beats -- a white page with a
 * swirl-orange dot bouncing onto the miss; an ink line riding the ring's edge
 * that traces every shape, a flat band behind it, the three-arm swirl on the
 * edge and the logo-style spiral at the centre; then a comic panel snap -- under
 * the voice's boot sting (the modem, then the startup swirl chime), which the
 * sound player plays, never the flourish. Headless: the recording canvas is
 * extended here to log strokes, fills and arcs; the browser half is proved by
 * docs/shots/item-1153/.
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
const look = R.eraLook(7);
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

function era6Game() {
  return Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 6 });
}

/** The recorder, plus a log of every stroke, fill, arc and strokeRect with the ink in force. */
function frame(g, opts) {
  const rec = eralooks.recorder();
  const log = [];
  const ctx = rec.ctx;
  ctx.stroke = function () { log.push(['stroke', this.strokeStyle, this.lineWidth, this.globalAlpha]); };
  ctx.fill = function () { log.push(['fill', this.fillStyle, this.globalAlpha]); };
  ctx.strokeRect = function (x, y, w, h) { log.push(['strokeRect', this.strokeStyle, this.lineWidth, x, y, w, h, this.globalAlpha]); };
  ctx.arc = function (x, y, r) { log.push(['arc', x, y, r]); };
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

/** Step the change on to a chosen eased progress. */
function stepTo(g, p) {
  for (let i = 0; i < 200; i++) {
    const m = R.eraChangeMoment(g);
    if (m && m.wiping && m.p >= p) return m;
    Pong.step(g, FRAME, {});
  }
  throw new Error(`the ring never reached p ${p}`);
}

test('era 7 registers the Dreamcast arrival on its own look', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  assert.ok(A && A.swirl && A.spiral && A.frame);
  assert.strictEqual(look.arrivalBeat(0.1), 1);
  assert.strictEqual(look.arrivalBeat(0.5), 2);
  assert.strictEqual(look.arrivalBeat(0.9), 3);
  // A borrowed look does not borrow the flourish: called for another rung it draws nothing.
  const g = era6Game();
  concede(g);
  const log = [];
  const ctx = eralooks.recorder().ctx;
  ctx.stroke = ctx.fill = ctx.strokeRect = () => log.push(1);
  look.flourish(ctx, 0.5, { x: 0, y: 300 }, 7, 8, { radius: 300, width: 800, height: 600, state: g, dim: null });
  assert.strictEqual(log.length, 0);
});

test('beat 1: the dot drops onto the miss and bounces twice, landed by p 0.25', () => {
  assert.strictEqual(look.dotHeight(0), A.bounce);
  let landings = 0;
  let prev = look.dotHeight(0);
  let falling = true;
  for (let p = 0.001; p <= 0.25; p += 0.001) {
    const h = look.dotHeight(p);
    assert.ok(h >= 0 && h <= A.bounce);
    if (falling && h > prev) { landings += 1; falling = false; }
    else if (!falling && h < prev) falling = true;
    prev = h;
  }
  assert.strictEqual(landings, 2, 'two bounces before it lands');
  assert.strictEqual(look.dotHeight(0.25), 0);
  assert.strictEqual(look.dotHeight(0.6), 0);
});

test('beat 2: the swirl sits on the edge and the spiral stays at the centre, inside the ring', () => {
  const o = { x: 0, y: 300 };
  for (const radius of [120, 400, 900]) {
    for (let arm = 0; arm < A.swirl.arms; arm++) {
      const pts = look.swirlArm(o, radius, 0.5, arm);
      assert.strictEqual(pts.length, A.swirl.points);
      for (const q of pts) {
        const d = Math.hypot(q.x - o.x, q.y - o.y);
        assert.ok(d >= radius - A.swirl.depth - 1e-6 && d <= radius + 1e-6, `swirl point at ${d.toFixed(1)} for R ${radius}`);
      }
    }
    const spiral = look.centreSpiral(o, radius, 0.5);
    assert.ok(spiral.length > 10);
    for (const q of spiral) assert.ok(Math.hypot(q.x - o.x, q.y - o.y) <= Math.min(A.spiral.size, radius * 0.7) + 1e-6);
  }
  // The spiral turns as the ring grows.
  const a = look.centreSpiral(o, 400, 0.4), b = look.centreSpiral(o, 400, 0.5);
  assert.notDeepStrictEqual(a[a.length - 1], b[b.length - 1]);
});

test('the change from era 6 plays all three beats, each on its own frames', () => {
  const g = era6Game();
  concede(g, 200);
  assert.strictEqual(g.era, 7);
  const ink = '#111111', orange = '#ee5a24', paper = '#ffffff';

  const m1 = stepTo(g, 0.12);
  const one = flourishOnly(g);
  assert.ok(one.some((c) => c[0] === 'fill' && c[1] === paper && c[2] === A.page), 'the white page');
  assert.ok(one.some((c) => c[0] === 'fill' && c[1] === orange && c[2] === 1), 'the orange dot');
  assert.ok(one.some((c) => c[0] === 'stroke' && c[1] === ink && c[2] === A.inkWidth), 'the ink line tracing shapes');
  assert.ok(m1.radius > 0);

  stepTo(g, 0.5);
  const two = flourishOnly(g);
  assert.ok(!two.some((c) => c[0] === 'fill' && c[1] === paper), 'the page is gone');
  assert.ok(two.filter((c) => c[0] === 'stroke' && c[1] === orange && c[2] === A.swirl.width).length === A.swirl.arms, 'three swirl arms');
  assert.ok(two.some((c) => c[0] === 'stroke' && c[1] === orange && c[2] === A.spiral.width), 'the centre spiral');
  assert.ok(two.some((c) => c[0] === 'fill' && c[1] === orange && c[2] === A.band.alpha), 'the flat band behind the ink');
  // Tracing every shape: the table, two band edges, the rail, nine buildings, and each paddle's faces.
  const traced = two.filter((c) => c[0] === 'stroke' && c[1] === ink && c[2] === A.inkWidth).length;
  assert.ok(traced >= 1 + 2 + 1 + 9 + 4, `${traced} shapes inked`);
  assert.ok(!two.some((c) => c[0] === 'strokeRect'), 'no panel frame yet');

  stepTo(g, 0.85);
  const three = flourishOnly(g);
  const panel = three.find((c) => c[0] === 'strokeRect');
  assert.deepStrictEqual(panel && panel.slice(1, 7), [ink, A.frame.width, 5, 5, 790, 590], 'the comic panel frame');
  assert.strictEqual(panel[7], 1);
  assert.strictEqual(three.filter((c) => c[0] === 'stroke' && c[1] === ink && c[2] === A.action.width).length, A.action.lines, 'sixteen action lines');
  assert.ok(!three.some((c) => c[0] === 'stroke' && c[2] === A.swirl.width), 'the edge swirl has gone');

  stepTo(g, 0.95);
  const fading = flourishOnly(g).find((c) => c[0] === 'strokeRect');
  assert.ok(fading && fading[7] > 0 && fading[7] < 1, 'the frame fades after p 0.9');
});

test('nothing it draws strays more than 60 pixels past the ring', () => {
  const g = era6Game();
  concede(g, 420);
  for (const p of [0.05, 0.2, 0.4, 0.6, 0.75]) {
    const m = stepTo(g, p);
    const arcs = flourishOnly(g).filter((c) => c[0] === 'arc');
    for (const c of arcs) {
      const reach = Math.hypot(c[1] - m.origin.x, c[2] - m.origin.y) + c[3];
      assert.ok(reach <= m.radius + 60, `an arc reaching ${reach.toFixed(1)} past a ring of ${m.radius.toFixed(1)} at p ${p}`);
    }
  }
});

test('it ends inside the serve pause, the paddles stay in the player\'s hands, and the state is untouched', () => {
  const g = era6Game();
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
  // Once the ring has gone the flourish is not called again.
  const after = frame(g);
  assert.ok(!after.some((c) => c[0] === 'strokeRect'));
});

test('behind the title the plain ring plays, with no flourish', () => {
  const rally = era6Game();
  concede(rally);
  stepTo(rally, 0.5);
  const dimmed = flourishOnly(rally, { ink: '#3a3a3a', card: false });
  assert.deepStrictEqual(dimmed, []);
});

test('the sound: a modem chirp resolving into the startup swirl chime is era 7\'s boot sting, played once', () => {
  const boot = Sound.voicesFor(7, 'boot');
  assert.ok(boot.length >= 8);
  const modem = boot.filter((v) => (v.at || 0) < 1.0);
  const chime = boot.filter((v) => (v.at || 0) >= 1.0);
  assert.ok(modem.some((v) => v.wave === 'sine' && v.freq === 2100), 'the answer tone');
  assert.ok(modem.some((v) => v.wave === 'square'), 'the handshake chirps');
  assert.ok(chime.some((v) => v.wave === 'sine' && v.attack >= 0.3), 'the slow-attack swell');
  assert.ok(Math.max(...modem.map((v) => (v.at || 0) + v.dur)) <= Math.min(...chime.map((v) => v.at)) + 1e-9, 'the modem resolves before the chime');

  const player = Sound.createPlayer({ AudioContext: fakeAudio() });
  player.unlock();
  const g = era6Game();
  concede(g);
  player.handle(g);
  assert.strictEqual(player.last.type, 'boot');
  assert.strictEqual(player.last.era, 7);
  for (let i = 0; i < 100; i++) { frame(g); frame(g); Pong.step(g, FRAME, {}); player.handle(g); }
  assert.strictEqual(player.boots, 1, 'once for the whole ring');
  assert.strictEqual(player.errors, 0);
});

test('the era file never reaches for sound and never walks pixels', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'eras', 'era7-dreamcast.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/PongSound|__pongSound|VOICES|\.play\s*\(/.test(code));
  assert.ok(!/getImageData|putImageData/.test(code));
  assert.ok(!/^\s*(import|export)\s/m.test(code), 'no ES modules');
});
