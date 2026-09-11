'use strict';
/*
 * The smash is heard (item 1208): a smash hit plays the era's own paddle notes
 * made heavier -- longer, harder, with an octave below -- through the same
 * player, and an ordinary hit is unchanged.
 */
const test = require('node:test');
const assert = require('node:assert');
const Pong = require('../src/game.js');
const PongSound = require('../src/sound.js');

/** The smallest AudioContext stand-in the player accepts: it counts oscillators. */
function fake() {
  const log = { oscillators: [] };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('ramp to ' + v); } });
  const node = () => ({ connect(to) { return to; } });
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = node(); }
    createOscillator() {
      const o = Object.assign(node(), { type: 'sine', frequency: param(), start() {}, stop() {} });
      log.oscillators.push(o);
      return o;
    }
    createGain() { return Object.assign(node(), { gain: param() }); }
    createDelay() { return Object.assign(node(), { delayTime: param() }); }
  }
  return { Ctx, log };
}

test('every era has a smash in its own voice: the same waves, heavier and lower', () => {
  for (let era = 0; era <= Pong.TOP_ERA; era++) {
    const plain = PongSound.voicesFor(era, 'paddle');
    const smash = PongSound.smashOf(plain);
    const tonal = plain.filter((v) => v.wave !== 'noise');
    assert.strictEqual(smash.length, plain.length + tonal.length, `era ${era}: each note, and an octave under each tone`);
    const waves = new Set(smash.map((v) => v.wave));
    for (const w of waves) assert.ok(plain.some((v) => v.wave === w), `era ${era} smashes in its own ${w}`);
    const len = (list) => Math.max(...list.map((v) => (v.at || 0) + v.dur));
    assert.ok(len(smash) > len(plain), `era ${era}: the smash rings longer`);
    assert.ok(Math.min(...smash.map((v) => v.freq)) < Math.min(...plain.map((v) => v.freq)), `era ${era}: and reaches lower`);
    assert.deepStrictEqual(PongSound.voicesFor(era, 'paddle'), plain, 'the voice table itself is untouched');
  }
});

test('the player plays a smash hit heavier than a plain one, and says so', () => {
  const { Ctx, log } = fake();
  const player = PongSound.createPlayer({ AudioContext: Ctx });
  player.unlock();
  player.play({ type: 'paddle', era: 0, smash: false });
  const plain = log.oscillators.length;
  assert.strictEqual(player.last.smash, false);
  player.play({ type: 'paddle', era: 0, smash: true });
  assert.ok(log.oscillators.length - plain > plain, 'more voices for the smash');
  assert.strictEqual(player.last.type, 'paddle');
  assert.strictEqual(player.last.smash, true);
});

test('a smash off the real rules reaches the voice as a smash', () => {
  const g = Pong.createGame({ rng: () => 0.5, phase: 'playing' });
  g.serveDelay = 0;
  const p = g.left;
  p.vy = 600;
  p.y = 300 - 10 - p.h / 2;
  Object.assign(g.ball, { x: p.x + p.w + 2, y: 300 - g.ball.size / 2, vx: -400, vy: 0 });
  Pong.step(g, 1 / 60, { pointerY: 300 });
  const { Ctx } = fake();
  const player = PongSound.createPlayer({ AudioContext: Ctx });
  player.unlock();
  assert.strictEqual(player.handle(g), 1);
  assert.strictEqual(player.last.smash, true);
});
