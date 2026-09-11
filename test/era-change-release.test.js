'use strict';
/*
 * Item 1238: an era change leaves nothing behind from the era it left.
 *
 * Tim, playing the live game: "each time this thing transitions eras i think it
 * gets slower and slower". Measured in Chrome (docs/measure/item1238/), the
 * frame times matched fresh eras, and what did pile up was the sound: every era
 * the match passed kept its sound-effect echo and reverb wired to the speakers,
 * and every music arrangement that faded out kept its echo loop and reverb wired
 * to each other. These tests climb the whole ladder -- ten era changes in a row
 * -- through the real sound player and the real music, on a stand-in for Web
 * Audio that keeps count of what is still plugged in, and hold each count to
 * what the same era has when it is opened fresh.
 *
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert');
const PongSound = require('../src/sound.js');
const PongMusic = require('../src/music.js');

/**
 * A stand-in AudioContext on a clock the test moves. It keeps the set of nodes
 * that are still plugged into something (a connect with no disconnect since),
 * and every source started with no stop scheduled -- a drone that plays until
 * somebody stops it.
 */
function audioBench() {
  const bench = { now: 0, wired: new Set(), sources: [], made: 0 };
  function param() {
    return {
      value: 0,
      setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime() {}, setTargetAtTime() {},
      exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exponential ramp to ' + v); },
      cancelScheduledValues() {}
    };
  }
  function node(kind, params) {
    bench.made += 1;
    const n = {
      kind,
      connect(to) { bench.wired.add(n); return to; },
      disconnect() { bench.wired.delete(n); }
    };
    for (const p of params || []) n[p] = param();
    return n;
  }
  function source(kind, params) {
    const s = node(kind, params);
    s.start = () => { s.started = true; bench.sources.push(s); };
    s.stop = (t) => { s.stopAt = t === undefined ? bench.now : t; };
    return s;
  }
  class BenchContext {
    constructor() { this.state = 'running'; this.sampleRate = 8000; this.destination = node('destination'); }
    get currentTime() { return bench.now; }
    resume() { return Promise.resolve(); }
    createGain() { return node('gain', ['gain']); }
    createDelay() { return node('delay', ['delayTime']); }
    createConvolver() { return node('convolver'); }
    createWaveShaper() { return node('shaper'); }
    createBiquadFilter() { return node('filter', ['frequency', 'Q', 'gain', 'detune']); }
    createStereoPanner() { return node('panner', ['pan']); }
    createOscillator() { const o = source('oscillator', ['frequency', 'detune']); o.setPeriodicWave = () => {}; return o; }
    createBufferSource() { return source('buffersource', ['playbackRate', 'detune']); }
    createPeriodicWave() { return {}; }
    createBuffer(ch, len) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { getChannelData: (c) => d[c] }; }
  }
  /**
   * What is still in use. Notes wire themselves up and are never unplugged by
   * the players -- the browser lets a note go once its source has ended -- so
   * the count that means something is the effects: every echo (a delay) and
   * every reverb (a convolver) still plugged in, and every drone still playing.
   */
  bench.effects = () => [...bench.wired].filter((n) => n.kind === 'delay' || n.kind === 'convolver').length;
  bench.drones = () => bench.sources.filter((s) => s.stopAt === undefined).length;
  bench.Context = BenchContext;
  return bench;
}

/** A game on `era`, playing, at game time `time`, with these events this step. */
function game(era, time, events, changedAt) {
  return { phase: 'playing', era, time, rally: 3, events: events || [], eraChangedAt: changedAt || 0 };
}

const SECONDS_PER_ERA = 12;   // long enough for a fade and every echo and reverb to ring out
const TICK = 0.1;

/**
 * Play `era` for SECONDS_PER_ERA on both players: a point that moved the
 * machine here (the boot sting), a rally's hits and bounces, the music booking
 * ahead every tick -- the shape of a real rung, on the bench's clock.
 */
function playRung(bench, sound, music, era, arrived) {
  const t0 = bench.now;
  const at = (dt) => t0 + dt;
  const changedAt = arrived ? t0 : -1;
  const hits = [0, 1.5, 3, 4.5, SECONDS_PER_ERA - 1];
  for (let dt = 0; dt < SECONDS_PER_ERA; dt = +(dt + TICK).toFixed(3)) {
    bench.now = at(dt);
    const events = [];
    if (dt === 0 && arrived) events.push({ type: 'score', era, time: t0 });
    if (hits.includes(dt) && dt > 0) events.push({ type: 'paddle', era, time: bench.now }, { type: 'wall', era, time: bench.now });
    const g = game(era, bench.now, events, changedAt);
    sound.handle(g);
    music.update(g);
  }
  bench.now = at(SECONDS_PER_ERA);
}

/** How many eras the sound player holds effects for (a player without the count reads -1). */
function busesOf(sound) { return typeof sound.buses === 'function' ? sound.buses() : -1; }

function players(bench) {
  const sound = PongSound.createPlayer({ AudioContext: bench.Context });
  const music = PongMusic.createMusic({ AudioContext: bench.Context });
  assert.ok(sound.unlock(), 'the sound player opens on the bench');
  assert.ok(music.unlock(), 'the music opens on the bench');
  return { sound, music };
}

/** The counts an era has when the page is opened straight on it: one rung, no climb. */
function freshCounts(era) {
  const bench = audioBench();
  const { sound, music } = players(bench);
  playRung(bench, sound, music, era, false);
  return { effects: bench.effects(), drones: bench.drones(), buses: busesOf(sound) };
}

test('ten era changes in a row leave each era with what it has fresh: echoes, reverbs, drones and sound buses', () => {
  const bench = audioBench();
  const { sound, music } = players(bench);
  const rows = [];
  for (let era = 0; era <= 10; era++) {
    playRung(bench, sound, music, era, era > 0);
    const fresh = freshCounts(era);
    rows.push({ era, climbed: { effects: bench.effects(), drones: bench.drones(), buses: busesOf(sound) }, fresh });
  }
  for (const r of rows) {
    assert.deepStrictEqual(r.climbed, r.fresh,
      `era ${r.era} after ${r.era} changes holds ${JSON.stringify(r.climbed)}; opened fresh it holds ${JSON.stringify(r.fresh)}`);
  }
  // And flat: the top of the ladder holds no more than the busiest single rung.
  const most = Math.max(...rows.map((r) => r.fresh.effects));
  assert.ok(rows[10].climbed.effects <= most,
    `the Xbox 360 after ten changes holds ${rows[10].climbed.effects} echoes and reverbs; the busiest single era needs ${most}`);
  assert.strictEqual(music.crossfades, 10, 'ten changes, ten cross-fades');
  assert.strictEqual(music.released, 10, 'and all ten faded arrangements let go of');
  assert.ok(sound.released >= 9, `the sound player let go of the eras it left (${sound.released})`);
  assert.strictEqual(music.errors, 0);
  assert.strictEqual(sound.errors, 0);
});

test('a faded arrangement is unplugged whole: every node its effects chain made, not only its bus', () => {
  const bench = audioBench();
  const { sound, music } = players(bench);
  // The PlayStation has the richest chain: crush, a swept filter with its LFO, an echo and a reverb.
  playRung(bench, sound, music, 5, false);
  const before = bench.effects();
  assert.ok(before >= 3, `the PlayStation's music and sound have their echoes and reverb plugged in (${before})`);
  const drones = bench.drones();
  assert.ok(drones >= 1, `and its swept filter's LFO is running (${drones})`);
  playRung(bench, sound, music, 6, true);
  const after = freshCounts(6);
  assert.strictEqual(bench.effects(), after.effects,
    `after the change and its fade, what is plugged in is the Nintendo 64's own (${bench.effects()} vs ${after.effects})`);
  assert.strictEqual(bench.drones(), after.drones, "and the PlayStation's LFO has stopped");
});

test('a reverb is built once per arrangement, not at every change into it', () => {
  const bench = audioBench();
  let buffers = 0;
  const Base = bench.Context;
  bench.Context = class extends Base { createBuffer(ch, len) { buffers += 1; return super.createBuffer(ch, len); } };
  const music = PongMusic.createMusic({ AudioContext: bench.Context });
  music.unlock();
  const sound = { handle() {} };
  // Up to the Xbox 360 and down again, the way the finale's rewind walks it, twice.
  const walk = [];
  for (let e = 0; e <= 10; e++) walk.push(e);
  for (let e = 9; e >= 0; e--) walk.push(e);
  for (let pass = 0; pass < 2; pass++) for (const e of walk) playRung(bench, sound, music, e, true);
  const reverbs = new Set(PongMusic.ARRANGEMENTS.filter((a) => a && a.effects && a.effects.reverb).map((a) => a.effects.reverb));
  assert.ok(buffers <= reverbs.size + 1,
    `${buffers} buffers made over ${walk.length * 2} changes; ${reverbs.size} reverbs (and the noise) exist`);
});
