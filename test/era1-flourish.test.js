'use strict';
/*
 * Era 1's arrival flourish (src/eras/era1-atari2600.js): the television coming
 * alive over the ring that brings the Atari in, and its soft warble sting.
 * Headless, on the recording canvas from tools/eralooks.js. The rolling picture
 * and the chroma fringe copy the page's own canvas, which the recorder does not
 * have, so those two are proved in Chrome by docs/shots/item-1137/crt-capture.mjs.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const { Pong, R } = eralooks.loadRenderer(path.join(__dirname, '..'));
require('../src/erachange.js');
const Sound = require('../src/sound.js');

const FRAME = 1 / 60;
const PHOSPHOR = 'rgba(184,255,216';
const WHITE = 'rgba(255,255,255';

/** Score one point for the computer: the ball leaves the player's side at height y. */
function concede(g, y) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y === undefined ? g.height / 2 : y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = g.ball.y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
}

function playing(opts) {
  return Pong.createGame(Object.assign({ rng: () => 0.3, phase: 'playing' }, opts || {}));
}

/** A recording canvas that refuses per-pixel work outright. */
function strictRecorder() {
  const rec = eralooks.recorder();
  for (const k of ['getImageData', 'putImageData', 'createImageData']) {
    rec.ctx[k] = () => { throw new Error(`per-pixel work: ${k}`); };
  }
  return rec;
}

/** Draw every frame of the ring now growing; returns each frame's moment and fill calls. */
function playRing(g, opts) {
  const frames = [];
  let m = R.eraChangeMoment(g);
  while (m && m.wiping && frames.length < 200) {
    const rec = strictRecorder();
    R.drawEraFrame(rec.ctx, g, opts);
    frames.push({ m, calls: rec.calls });
    Pong.step(g, FRAME, {});
    m = R.eraChangeMoment(g);
  }
  return frames;
}

const inks = (frame) => frame.calls.map((c) => String(c[0]));
const hasInk = (frame, prefix) => inks(frame).some((i) => i.startsWith(prefix));

test('era 1 registers a flourish, and the change into it draws the set coming on every frame of the ring', () => {
  const look = R.eraLook(1);
  assert.strictEqual(typeof look.flourish, 'function');
  const real = look.flourish;
  let called = 0;
  look.flourish = function () { called += 1; return real.apply(this, arguments); };
  try {
    const g = playing();
    concede(g, 150);
    assert.strictEqual(g.era, 1);
    const frames = playRing(g);
    assert.ok(frames.length >= 80, `the ring ran ${frames.length} frames`);
    assert.strictEqual(called, frames.length, 'the hook drew on every one');

    const lit = frames.filter((f) => f.m.radius > 1);
    assert.ok(lit.every((f) => hasInk(f, PHOSPHOR)), 'the phosphor scanline band rides the edge on every frame');

    // The power-on line: a white line the whole width of the field, at the
    // height of the miss, for the first moment only.
    const line = (f) => f.calls.some((c) => String(c[0]).startsWith(WHITE) &&
      c[1] === 0 && c[3] === g.width && Math.abs(c[2] + c[4] / 2 - f.m.origin.y) < 1e-9);
    assert.ok(line(frames[1]), 'the tube opens with a line across the field');
    assert.ok(!line(frames[frames.length - 1]), 'and it has gone by the end of the ring');
    const lineFrames = frames.filter(line).length;
    assert.ok(lineFrames >= 12 && lineFrames <= 20, `on screen for ${lineFrames} frames (0.28 s)`);
  } finally {
    look.flourish = real;
  }
});

test('the flourish only paints: the state is untouched and no pixel is ever read or written', () => {
  const g = playing();
  concede(g, 420);
  for (let i = 0; i < 90; i++) {
    const before = JSON.stringify(g);
    const m = R.eraChangeMoment(g);
    if (!m || !m.wiping) break;
    R.drawEraFrame(strictRecorder().ctx, g);
    assert.strictEqual(JSON.stringify(g), before, `frame ${i} left the state as it was`);
    Pong.step(g, FRAME, {});
  }
});

test('it plays only on the way into era 1: later rungs, era 4 included (like: 1), bring their own', () => {
  const plays = [];
  globalThis.__pongSound = { play(ev) { plays.push(ev); return true; } };
  try {
    for (const from of [1, 2, 3]) {
      const g = playing({ era: from });
      concede(g, 200);
      assert.strictEqual(g.era, from + 1);
      const frames = playRing(g);
      assert.ok(frames.length > 0);
      assert.ok(frames.every((f) => !hasInk(f, PHOSPHOR)), `no TV band on the way into era ${from + 1}`);
    }
    assert.deepStrictEqual(plays, [], 'and no sting');
  } finally {
    delete globalThis.__pongSound;
  }
});

test('the warble sting plays once per change, in the Atari voice, soft, and never behind the title', () => {
  const plays = [];
  globalThis.__pongSound = { play(ev) { plays.push(ev); return true; } };
  try {
    playRing((() => { const g = playing(); concede(g); return g; })());
    assert.deepStrictEqual(plays, [{ type: 'sting', era: 1 }], 'once, for the whole ring');

    const sting = Sound.voicesFor(1, 'sting');
    assert.strictEqual(sting.length, 3, 'era 1\'s row of voices now carries the sting');
    assert.ok(sting.every((v) => v.wave === 'square'), 'square waves, like every other Atari note');
    const hit = Sound.voicesFor(1, 'paddle')[0].gain;
    assert.ok(sting.every((v) => v.gain < hit / 2), 'softer than half a paddle hit');
    const wobble = sting.filter((v) => v.fm).map((v) => v.freq * v.fm.ratio);
    assert.ok(wobble.length && wobble.every((hz) => hz >= 3 && hz <= 12), `it warbles at ${wobble.map((w) => w.toFixed(1))} Hz`);
    const end = Math.max(...sting.map((v) => (v.at || 0) + v.dur));
    assert.ok(end < Pong.RULES.eraChangePause, `over in ${end.toFixed(2)} s, inside the pause`);

    playRing((() => { const g = playing(); concede(g); return g; })());
    assert.strictEqual(plays.length, 2, 'the next match\'s change plays it again');

    // The demo rally behind the title climbs to era 1 too: its ring gets the
    // band in the demo's dim ink, and no sound, no white line, no phosphor.
    const rally = Pong.createGame({ rng: () => 0.3, phase: 'playing', rules: { serveDelay: 1.3 } });
    concede(rally);
    const frames = playRing(rally, { ink: '#3a3a3a', card: false });
    assert.ok(frames.length > 0);
    assert.strictEqual(plays.length, 2, 'silent behind the title');
    assert.ok(frames.every((f) => !hasInk(f, PHOSPHOR) && !hasInk(f, WHITE)), 'dim, not lit');
  } finally {
    delete globalThis.__pongSound;
  }
});
