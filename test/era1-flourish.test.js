'use strict';
/*
 * Era 1's arrival flourish (src/eras/era1-atari2600.js): the television coming
 * alive over the ring that brings the Atari in, and its soft warble -- which is
 * the Atari voice's boot sting in src/sound.js, never a call from the flourish.
 * Headless, on the recording canvas from tools/eralooks.js. The rolling picture
 * and the chroma fringe copy the page's own canvas, which the recorder does not
 * have, so those two are proved in Chrome by docs/shots/item-1137/crt-capture.mjs.
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

/** A silent stand-in for Web Audio: just enough surface for the player to schedule notes. */
function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (extra) => Object.assign({ connect(to) { return to; } }, extra);
  return class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = node({}); }
    createOscillator() { return node({ type: 'sine', frequency: param(), start() {}, stop() {} }); }
    createGain() { return node({ gain: param() }); }
    createDelay() { return node({ delayTime: param() }); }
  };
}

/** The page's real player, unlocked on the stand-in, and what it sounded after each step. */
function listener() {
  const player = Sound.createPlayer({ AudioContext: fakeAudio() });
  player.unlock();
  const heard = [];
  return {
    player,
    heard,
    listen(g) {
      const before = player.played;
      player.handle(g);
      if (player.played > before) heard.push({ type: player.last.type, era: player.last.era });
    }
  };
}

/** The page's sound globals where a flourish could reach them, every call counted, the table watched. */
function withPageSound(fn) {
  const calls = [];
  const had = { sound: 'PongSound' in globalThis, player: '__pongSound' in globalThis };
  const table = JSON.stringify(Sound.VOICES);
  globalThis.PongSound = Sound;
  globalThis.__pongSound = {
    play(ev) { calls.push(ev); return true; },
    handle() { calls.push('handle'); return 0; }
  };
  try {
    fn(calls);
    assert.strictEqual(JSON.stringify(Sound.VOICES), table, 'the voice table is exactly as it loaded');
  } finally {
    if (!had.sound) delete globalThis.PongSound;
    if (!had.player) delete globalThis.__pongSound;
  }
}

/** The warble: the Atari boot sting's notes after the point's own. */
function warble() {
  return Sound.voicesFor(1, 'boot').slice(Sound.voicesFor(1, 'score').length);
}

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
  const ear = listener();
  const tv = warble();
  for (const from of [1, 2, 3]) {
    const g = playing({ era: from });
    concede(g, 200);
    ear.listen(g);
    assert.strictEqual(g.era, from + 1);
    const frames = playRing(g);
    assert.ok(frames.length > 0);
    assert.ok(frames.every((f) => !hasInk(f, PHOSPHOR)), `no TV band on the way into era ${from + 1}`);
  }
  assert.deepStrictEqual(ear.heard.map((h) => h.era), [2, 3, 4], 'each change sounds on the era it arrives at');
  for (const h of ear.heard) {
    assert.ok(!Sound.voicesFor(h.era, h.type).some((v) => tv.includes(v)),
      `the change into era ${h.era} (${h.type}) carries no note of the TV warble`);
  }
});

test('the warble is the Atari voice\'s boot sting: square, soft, wobbling, and over inside the pause', () => {
  const score = Sound.voicesFor(1, 'score');
  const boot = Sound.voicesFor(1, 'boot');
  assert.deepStrictEqual(boot.slice(0, score.length), score, 'the point that turns the machine to colour is still heard');
  const sting = warble();
  assert.strictEqual(sting.length, 3, 'then the three notes of the warble');
  assert.ok(sting.every((v) => v.wave === 'square'), 'square waves, like every other Atari note');
  const hit = Sound.voicesFor(1, 'paddle')[0].gain;
  assert.ok(sting.every((v) => v.gain < hit / 2), 'softer than half a paddle hit');
  const wobble = sting.filter((v) => v.fm).map((v) => v.freq * v.fm.ratio);
  assert.ok(wobble.length && wobble.every((hz) => hz >= 3 && hz <= 12), `it warbles at ${wobble.map((w) => w.toFixed(1))} Hz`);
  // Where item 1137 measured it: from the ring's first frame to 0.86 s, inside the pause.
  assert.strictEqual(Math.min(...sting.map((v) => v.at || 0)), 0, 'it starts with the point, on the ring\'s first frame');
  const end = Math.max(...sting.map((v) => (v.at || 0) + v.dur));
  assert.ok(Math.abs(end - 0.86) < 1e-9, `over at ${end.toFixed(2)} s`);
  assert.ok(end < Pong.RULES.eraChangePause, 'inside the pause');
});

test('the change into era 1 sounds the warble once, however often the ring is drawn, and the next match sounds it again', () => {
  const ear = listener();
  const g = playing();
  concede(g);
  ear.listen(g);
  assert.deepStrictEqual(ear.heard, [{ type: 'boot', era: 1 }], 'the point that brings the Atari in plays its boot sting');
  // Every frame of the ring drawn twice -- the page's canvas and a recorder -- with the player handed every step.
  let m = R.eraChangeMoment(g);
  let n = 0;
  while (m && m.wiping && n < 200) {
    R.drawEraFrame(strictRecorder().ctx, g);
    R.drawEraFrame(strictRecorder().ctx, g);
    Pong.step(g, FRAME, {});
    ear.listen(g);
    m = R.eraChangeMoment(g);
    n += 1;
  }
  assert.ok(n >= 80, `the ring ran ${n} frames`);
  assert.strictEqual(ear.player.boots, 1, 'once for the whole ring');
  assert.strictEqual(ear.heard.filter((h) => h.type === 'boot').length, 1);
  assert.strictEqual(ear.player.errors, 0);

  const next = playing();
  concede(next);
  ear.listen(next);
  assert.strictEqual(ear.player.boots, 2, 'the next match\'s change plays it again');
  assert.deepStrictEqual(ear.heard[ear.heard.length - 1], { type: 'boot', era: 1 });
});

test('the flourish makes no sound call and leaves the voice table alone, in a real game and behind the title', () => {
  withPageSound((calls) => {
    const g = playing();
    concede(g, 150);
    assert.ok(playRing(g).length >= 80);

    // The demo rally behind the title climbs to era 1 too: its ring gets the
    // band in the demo's dim ink, and no white line, no phosphor.
    const rally = Pong.createGame({ rng: () => 0.3, phase: 'playing', rules: { serveDelay: 1.3 } });
    concede(rally);
    const frames = playRing(rally, { ink: '#3a3a3a', card: false });
    assert.ok(frames.length > 0);
    assert.ok(frames.every((f) => !hasInk(f, PHOSPHOR) && !hasInk(f, WHITE)), 'dim, not lit');
    assert.deepStrictEqual(calls, [], 'not one sound call from the flourish');
  });

  const code = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/PongSound|__pongSound|VOICES|\.play\s*\(/.test(code('src/eras/era1-atari2600.js')),
    'the era file never reaches for the sound module, the page\'s player or the voice table');
  // The title's demo rally is silent because the page never hands it to the player.
  const main = code('src/main.js');
  assert.ok(/sound\.handle\(game\)/.test(main) && !/sound\.handle\(attract\)/.test(main),
    'the player hears the real game only');
});
