'use strict';
/*
 * Era 2's arrival flourish (src/eras/era2-nes.js, consoleSwap): the change
 * from the Atari to the NES plays as a cartridge reset -- a one-frame black
 * blink, tiles turning over just ahead of the ring from the miss outward, and
 * a rolling band inside the edge -- under a power-on chime that is the NES
 * voice's boot sting in src/sound.js, never a call from the flourish.
 * Headless: no document, so the tiles draw as flat panels on the recording
 * canvas; the browser half is proved by the playtest frame.
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
const look = R.eraLook(2);
const swap = look.consoleSwap;

function concede(g, y) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y === undefined ? g.height / 2 : y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = g.ball.y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
}

function atariGame() {
  return Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 1 });
}

function frame(g, opts) {
  const rec = eralooks.recorder();
  R.drawEraFrame(rec.ctx, g, opts);
  return rec.calls;
}

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

test('era 2 registers the console-swap flourish on its own look', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  assert.ok(swap && typeof swap.flipPhase === 'function');
  assert.strictEqual(swap.tile, 40, 'the court\'s own tile grid');
});

test('tiles turn just ahead of the ring, nearest the miss first, and land as the ring reaches them', () => {
  const origin = { x: 0, y: 300 };
  const near = [0, 7];     // the tile at the miss
  const far = [15, 7];     // 600 units along
  assert.strictEqual(swap.flipPhase(...far, origin, 0), 0, 'nothing turns far from a new ring');
  assert.ok(swap.flipPhase(...near, origin, 10) > 0, 'the tile at the miss is already turning');
  let prev = 0;
  for (let r = 0; r <= 900; r += 15) {
    const f = swap.flipPhase(...far, origin, r);
    assert.ok(f >= prev, `a tile never turns back (radius ${r})`);
    prev = f;
  }
  const cx = 15.5 * 40, cy = 7.5 * 40;
  const d = Math.hypot(cx - origin.x, cy - origin.y);
  assert.strictEqual(swap.flipPhase(...far, origin, d - swap.lead - swap.jitter - 1), 0, 'still flat ahead of the lead');
  assert.strictEqual(swap.flipPhase(...far, origin, d + swap.jitter + 1), 1, 'flat on the new era once the ring is there');
  // The tiles in the band ahead of the ring are all at different points of their turn:
  // the scatter makes it one by one, not a ring of identical tiles.
  const phases = new Set();
  let band = 0;
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 20; col++) {
      const f = swap.flipPhase(col, row, origin, 300);
      if (f > 0 && f < 1) { band += 1; phases.add(f.toFixed(3)); }
    }
  }
  assert.ok(band > 20, `${band} tiles turning at once`);
  assert.ok(phases.size > band * 0.8, `${phases.size} different phases among ${band} turning tiles`);
});

test('the picture rolls during the wipe and settles square as it ends', () => {
  assert.strictEqual(swap.rollOffset(0, 600), 0);
  assert.ok(Math.abs(swap.rollOffset(1, 600)) < 1e-6 || Math.abs(swap.rollOffset(1, 600) - 600) < 1e-6);
  assert.ok(swap.rollOffset(0.3, 600) > 0);
});

test('the change into era 2 blinks black for exactly one frame, then draws turning tiles', () => {
  const g = atariGame();
  concede(g, 200);
  assert.strictEqual(g.era, 2);
  // The blink is the frame's LAST word: a whole-field black fill with nothing over it
  // (the Atari frame's own black background is drawn first and covered).
  const blackFill = (calls) => {
    const c = calls[calls.length - 1];
    return !!c && c[0] === '#000000' && c[1] === 0 && c[2] === 0 && c[3] === g.width && c[4] === g.height;
  };
  assert.ok(blackFill(frame(g)), 'the first frame of the ring is the power-off blink');
  let blinks = 0;
  let turning = 0;
  for (let i = 0; i < 100; i++) {
    Pong.step(g, FRAME, {});
    const m = R.eraChangeMoment(g);
    if (!m || !m.wiping) break;
    const calls = frame(g);
    if (blackFill(calls)) blinks += 1;
    if (calls.some((c) => /^rgba\(0,0,0,/.test(c[0]))) turning += 1;
  }
  assert.strictEqual(blinks, 0, 'never blinks again');
  assert.ok(turning > 60, `tiles turning on ${turning} frames of the ring`);
});

test('the flourish never changes the state and never shows behind the title', () => {
  const g = atariGame();
  concede(g);
  Pong.step(g, 0.5, {});
  frame(g);
  const before = JSON.stringify(g);
  frame(g);
  assert.strictEqual(JSON.stringify(g), before);
  // The dimmed rally: the plain ring and no flourish at all.
  const orig = look.flourish;
  const rally = Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 1 });
  concede(rally);
  Pong.step(rally, 0.4, {});
  const dimmed = frame(rally, { ink: '#3a3a3a', card: false });
  assert.ok(!dimmed.some((c) => /^rgba\(0,0,0,/.test(c[0])), 'no turning tiles in the rally');
  assert.strictEqual(orig, look.flourish);
});

test('the power-on chime is the NES voice\'s boot sting: after the point\'s arpeggio and inside the pause', () => {
  const score = Sound.voicesFor(2, 'score');
  const boot = Sound.voicesFor(2, 'boot');
  assert.deepStrictEqual(boot.slice(0, score.length), score, 'the point\'s arpeggio is still heard first');
  const chime = boot.slice(score.length);
  assert.strictEqual(chime.length, 3, 'then the chime');
  assert.ok(chime.every((v) => v.wave === 'square' || v.wave === 'triangle'), 'pulse and triangle only');
  const arpeggioEnd = Math.max(...score.map((v) => (v.at || 0) + v.dur));
  for (const v of chime) {
    assert.ok(v.at >= arpeggioEnd, `starts at ${v.at} s, after the point's notes end at ${arpeggioEnd} s`);
    assert.ok(v.at + v.dur <= Pong.RULES.eraChangePause, 'over inside the pause');
  }
  // Where item 1138 put it: 0.45 s to 0.85 s after the point.
  assert.strictEqual(Math.min(...chime.map((v) => v.at)), 0.45);
  assert.ok(Math.abs(Math.max(...chime.map((v) => v.at + v.dur)) - 0.85) < 1e-9);
});

test('the change into era 2 sounds the chime once, however often the ring is drawn', () => {
  const ear = listener();
  const g = atariGame();
  concede(g);
  ear.listen(g);
  assert.deepStrictEqual(ear.heard, [{ type: 'boot', era: 2 }], 'the point that brings the NES in plays its boot sting');
  // Every frame drawn twice -- the page's canvas and a recorder -- with the player handed every step.
  for (let i = 0; i < 100; i++) { frame(g); frame(g); Pong.step(g, FRAME, {}); ear.listen(g); }
  assert.strictEqual(ear.player.boots, 1, 'once for the whole ring');
  assert.strictEqual(ear.heard.filter((h) => h.type === 'boot').length, 1);
  assert.strictEqual(ear.player.errors, 0);
});

test('the flourish makes no sound call and leaves the voice table alone, in a real game and behind the title', () => {
  withPageSound((calls) => {
    const g = atariGame();
    concede(g);
    for (let i = 0; i < 100; i++) { frame(g); Pong.step(g, FRAME, {}); }
    const rally = atariGame();
    concede(rally);
    for (let i = 0; i < 30; i++) { frame(rally, { ink: '#3a3a3a', card: false }); Pong.step(rally, FRAME, {}); }
    assert.deepStrictEqual(calls, [], 'not one sound call from the flourish');
  });
  const code = fs.readFileSync(path.join(ROOT, 'src', 'eras', 'era2-nes.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/PongSound|__pongSound|VOICES|\.play\s*\(/.test(code),
    'the era file never reaches for the sound module, the page\'s player or the voice table');
});

test('with no page player at all the flourish still draws and never throws', () => {
  const g = atariGame();
  concede(g);
  assert.doesNotThrow(() => { for (let i = 0; i < 20; i++) { frame(g); Pong.step(g, FRAME, {}); } });
});
