'use strict';
/*
 * Headless tests for the engine that lets the music go epic (item 1241): each
 * era's voice count, its drum kit, its period production chain, the master
 * limiter, and the intensity that adds layers as the rally and the score
 * climb. The arrangements themselves are the next cards' (1242, 1243); these
 * checks hold for any arrangement those cards write.
 *
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert');
const Pong = require('../src/game.js');
const M = require('../src/music.js');

const T = M.THEME;
const TOTAL = T.steps * T.bars;

/** A stand-in AudioContext: records nodes, connections and param writes; makes no sound. */
function recorder(opts) {
  opts = opts || {};
  const log = { oscillators: [], gains: [], sources: [], convolvers: [], filters: [], delays: [],
                shapers: [], compressors: [], buffers: [], edges: [] };
  function param(name) {
    return {
      name, value: 0, writes: [],
      setValueAtTime(v, t) { this.value = v; this.writes.push(['set', v, t]); },
      linearRampToValueAtTime(v, t) { this.writes.push(['lin', v, t]); },
      exponentialRampToValueAtTime(v, t) {
        if (!(v > 0)) throw new RangeError('exponential ramp to ' + v);
        this.writes.push(['exp', v, t]);
      },
      cancelScheduledValues() { this.writes.push(['cancel']); }
    };
  }
  function node(kind) {
    return {
      kind, unplugged: false, outs: [],
      connect(to) { this.outs.push(to); log.edges.push([this, to]); return to; },
      disconnect() { this.unplugged = true; }
    };
  }
  class FakeContext {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.state = 'running';
      this.destination = node('destination');
      log.ctx = this;
    }
    createOscillator() {
      const o = node('oscillator');
      o.type = 'sine';
      o.frequency = param('frequency');
      o.detune = param('detune');
      o.setPeriodicWave = () => {};
      o.start = () => {};
      o.stop = () => {};
      log.oscillators.push(o);
      return o;
    }
    createGain() { const g = node('gain'); g.gain = param('gain'); log.gains.push(g); return g; }
    createBiquadFilter() {
      const f = node('filter'); f.type = 'lowpass'; f.frequency = param('f'); f.Q = param('q'); log.filters.push(f); return f;
    }
    createDelay() { const d = node('delay'); d.delayTime = param('delay'); log.delays.push(d); return d; }
    createConvolver() { const c = node('convolver'); log.convolvers.push(c); return c; }
    createWaveShaper() { const s = node('shaper'); log.shapers.push(s); return s; }
    createStereoPanner() { const p = node('panner'); p.pan = param('pan'); return p; }
    createPeriodicWave(real) { return { kind: 'periodic', real }; }
    createBuffer(ch, len) {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      const b = { length: len, getChannelData: (c) => data[c] };
      log.buffers.push(b);
      return b;
    }
    createBufferSource() {
      const s = node('source'); s.start = () => {}; s.stop = () => {}; log.sources.push(s); return s;
    }
  }
  if (opts.compressor) {
    FakeContext.prototype.createDynamicsCompressor = function () {
      const c = node('compressor');
      ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach((k) => { c[k] = param(k); });
      log.compressors.push(c);
      return c;
    };
  }
  return { FakeContext, log };
}

function playingGame(era, extra) {
  const g = Pong.createGame({ rng: () => 0.5, phase: 'playing', era: era || 0 });
  return Object.assign(g, extra || {});
}

/** Play `seconds` of music on the stand-in, ticking the way the page's timer does. */
function play(music, log, game, seconds) {
  const start = log.ctx.currentTime;
  for (let t = 0; t <= seconds; t += 0.05) {
    log.ctx.currentTime = start + t;
    game.time = (game.time || 0) + 0.05;
    music.update(game);
  }
}

/** Every oscillator started on `freq` Hz (to a hundredth). */
function oscAt(log, freq) {
  return log.oscillators.filter((o) => o.frequency.writes.some((w) => w[0] === 'set' && Math.abs(w[1] - freq) < 0.01));
}

// ------------------------------------------------------------ the hardware

test('every era file carries its year, its voice count, its kit and its production chain', () => {
  const years = [1972, 1977, 1985, 1989, 1991, 1994, 1996, 1999, 2000, 2001, 2005];
  M.ARRANGEMENTS.forEach((a, era) => {
    assert.ok(a, `era ${era} has an arrangement file`);
    assert.strictEqual(a.era, era, `era ${era}'s file says it is era ${a.era}`);
    assert.strictEqual(a.year, years[era], `era ${era} stands for ${years[era]}`);
    assert.ok(a.voices >= 1, `era ${era} names its voice count`);
    assert.ok(a.chain && typeof a.chain === 'object', `era ${era} names its period production`);
  });
});

test("each era's voice count is its machine's own, from two on the Atari to hundreds on the 360", () => {
  const v = M.ARRANGEMENTS.map((a) => a.voices);
  // The real chips (docs/MUSIC.md), not a smooth climb: the Genesis's 6 FM + 4
  // PSG voices outnumber the SNES's 8 sampled channels, and the Dreamcast's AICA
  // (64) the PlayStation 2's SPU2 (48). The 1972 cabinet's one is its hum.
  assert.deepStrictEqual(v, [1, 2, 5, 10, 8, 24, 24, 64, 48, 64, 256]);
  const cartridge = Math.max(...v.slice(0, 5));
  for (let e = 5; e < v.length; e++) assert.ok(v[e] > cartridge, `the 3D era ${e} (${v[e]}) outnumbers every cartridge (${cartridge})`);
  assert.strictEqual(v[1], 2, "the Atari's TIA has two voices");
  assert.ok(v[10] >= 64, `the 360 has ${v[10]} voices`);
});

test('every era from 1977 on has a drum kit with a kick, a snare and a hat; the 1972 cabinet has none', () => {
  assert.ok(!M.ARRANGEMENTS[0].kit, 'the arcade cabinet had no drums');
  for (let e = 1; e < M.ARRANGEMENTS.length; e++) {
    const kit = M.ARRANGEMENTS[e].kit;
    ['kick', 'snare', 'hat'].forEach((piece) => assert.ok(kit && kit[piece], `era ${e}'s kit has a ${piece}`));
  }
});

test('every arrangement is still a clean one, and the existing loops fit their chips and lose nothing', () => {
  M.ARRANGEMENTS.forEach((a, era) => {
    assert.deepStrictEqual(M.arrangementProblems(a), [], `era ${era}`);
    const score = M.arrange(a);
    assert.ok(!score.dropped, `era ${era}'s loop drops ${score.dropped} notes to its ${a.voices} voices`);
  });
});

// ------------------------------------------------------------ kits

test('a drum part names its kit piece, and a piece that is a list plays every layer on each hit', () => {
  const snare = [{ wave: 'noise', gain: 0.1 }, { wave: 'triangle', freq: 190, gain: 0.08 }];
  const arr = { kit: { snare }, parts: [{ play: 'drum', hit: 'snare', pattern: '. . . . X . . . . . . . x . . .' }] };
  assert.deepStrictEqual(M.arrangementProblems(arr), []);
  const score = M.arrange(arr);
  assert.strictEqual(score[4].length, 2, 'two layers on the backbeat');
  assert.deepStrictEqual(score[4].map((e) => e.voice), snare);
  assert.ok(score[4].every((e) => e.accent), 'the accent rides every layer');
  assert.strictEqual(score[12].length, 2);
  assert.strictEqual(score[0].length, 0);
});

test('the table check names a kit piece that is missing and a kit voice with no sound', () => {
  const missing = { kit: { kick: { wave: 'kick', freq: 60, gain: 0.3 } },
                    parts: [{ play: 'drum', hit: 'snare', pattern: '. . . . x . . . . . . . x . . .' }] };
  assert.match(M.arrangementProblems(missing).join(' | '), /the kit has no snare/);
  const silent = { kit: { tom: { wave: 'sine', gain: 0.2 } }, parts: [] };
  assert.match(M.arrangementProblems(silent).join(' | '), /kit tom: a pitched hit needs a freq/);
  const bare = { parts: [{ play: 'drum', pattern: 'x . . . . . . . . . . . . . . .' }] };
  assert.match(M.arrangementProblems(bare).join(' | '), /needs a voice/);
});

// ------------------------------------------------------------ voices

test('a full chip drops the latest-listed part first, and the table check says so', () => {
  const v = (gain) => ({ wave: 'square', gain });
  const arr = {
    voices: 2,
    parts: [
      { play: 'melody', rule: 'full', voice: v(0.1) },
      { play: 'bass', rule: 'held', voice: v(0.1) },
      { play: 'chords', rule: 'offbeat', voice: v(0.05) }   // a triad: three notes at once
    ]
  };
  assert.match(M.arrangementProblems(arr).join(' | '), /sounds \d+ voices at once, the chip has 2/);
  const score = M.arrange(arr);
  assert.ok(score.dropped > 0, 'something had to go');
  const kept = new Set();
  score.forEach((list) => list.forEach((e) => kept.add(e.part)));
  assert.ok(kept.has(0) && kept.has(1), 'the tune and the bass stay');
  assert.ok(!kept.has(2), 'the chords, listed last and three voices wide, are what the chip drops');
  assert.ok(M.peakVoices(score, arr) <= 2, 'what is left never sounds more than two notes');
  // With room for everything, nothing is dropped.
  const roomy = M.arrange(Object.assign({}, arr, { voices: 8 }));
  assert.ok(!roomy.dropped);
});

test('a pad counts as one voice, the way the sample chips stretched a chord over one channel', () => {
  const arr = { voices: 2, parts: [
    { play: 'melody', rule: 'full', voice: { wave: 'square', gain: 0.1 } },
    { play: 'chords', rule: 'pad', voice: { wave: 'sawtooth', gain: 0.05 } }
  ] };
  assert.deepStrictEqual(M.arrangementProblems(arr), []);
  assert.ok(!M.arrange(arr).dropped);
});

// ------------------------------------------------------------ intensity

test('intensity: nothing on the title screen, a little at the first serve, climbing with the rally', () => {
  assert.strictEqual(M.intensityOf(null), 0);
  assert.strictEqual(M.intensityOf(Pong.createGame({ era: 3 })), 0, 'the title screen');
  assert.strictEqual(M.intensityOf(playingGame(0)), 0, 'the first serve');
  let last = -1;
  for (let r = 0; r <= 20; r++) {
    const i = M.intensityOf(playingGame(0, { rally: r }));
    assert.ok(i >= last, `a rally of ${r} (${i}) is never smaller than ${r - 1} (${last})`);
    last = i;
  }
  assert.strictEqual(M.intensityOf(playingGame(0, { rally: M.INTENSITY.rallyFull })), M.INTENSITY.rallyShare);
  assert.strictEqual(M.intensityOf(playingGame(0, { rally: 200 })), M.INTENSITY.rallyShare, 'a rally is only worth its share');
});

test('intensity: the points played add their share, and the ordinary game stays under the match-point layers', () => {
  const g = playingGame(5);
  g.score.left = 3; g.score.right = 2;
  const five = M.intensityOf(g);
  assert.ok(Math.abs(five - M.INTENSITY.scoreShare * 5 / 10) < 1e-9, `five points of eleven: ${five}`);
  g.score.left = 5; g.score.right = 4; g.rally = 999;
  const nine = M.intensityOf(g);
  assert.ok(nine < M.INTENSITY.matchPoint, `nine points and a huge rally (${nine}) is still under match point`);
  assert.ok(nine > five);
});

test('intensity: match point is 0.9 and up, a rally there takes it to 1, and the finale holds it at 1', () => {
  const g = playingGame(10);
  g.score.left = 5; g.score.right = 5;
  assert.ok(Pong.isMatchPoint(g), 'ten points played: the next one ends it');
  assert.strictEqual(M.intensityOf(g), M.INTENSITY.matchPoint);
  g.rally = M.INTENSITY.rallyFull;
  assert.strictEqual(M.intensityOf(g), 1);
  g.phase = 'over';
  g.rally = 0;
  assert.strictEqual(M.intensityOf(g), 1, 'the announce and the rewind down the ladder play everything');
});

test('intensity: a game that never ends counts its points against ten and never reaches match point', () => {
  const g = Pong.createGame({ rng: () => 0.5, phase: 'playing', rules: { matchPoints: 0 } });
  assert.strictEqual(g.rules.matchPoints, 0);
  g.score.left = 30;
  const i = M.intensityOf(g);
  assert.strictEqual(i, M.INTENSITY.scoreShare);
  assert.ok(i < M.INTENSITY.matchPoint);
});

// ------------------------------------------------------------ layers

test('the engine lifts every era with a tom and a crash: a roll into each section at 0.7, a crash every bar at 0.9', () => {
  const arr = M.ARRANGEMENTS[10];
  const plain = M.arrange(arr);
  const lifted = M.arrange(arr, T, { lift: true });
  const extra = (score) => score.reduce((n, list) => n + list.filter((e) => e.from > 0).length, 0);
  assert.strictEqual(extra(plain), 0, 'the arrangement on its own has no lift layers');
  const crashes = [], toms = [];
  lifted.forEach((list, s) => list.forEach((e) => {
    if (e.voice === arr.kit.crash && e.from === 0.9) crashes.push(s);
    if (e.voice === arr.kit.tom && e.from === 0.7) toms.push(s);
  }));
  assert.deepStrictEqual(crashes, Array.from({ length: T.bars }, (_, b) => b * T.steps), 'a crash on every downbeat');
  const lastBars = Object.values(T.sections).map((bars) => bars[bars.length - 1]);
  assert.ok(toms.length > 0);
  assert.ok(toms.every((s) => lastBars.includes(Math.floor(s / T.steps))), 'the roll only in the last bar of a section');
  // Everything the arrangement plays is still there, in the same place.
  plain.forEach((list, s) => assert.deepStrictEqual(lifted[s].filter((e) => !(e.from > 0)).length, list.length, `step ${s}`));
  assert.strictEqual(M.arrange(M.ARRANGEMENTS[0], T, { lift: true }).reduce((n, l) => n + l.length, 0),
    M.arrange(M.ARRANGEMENTS[0]).reduce((n, l) => n + l.length, 0), 'the cabinet has no kit, so nothing lifts it');
});

test('a part with `from` waits for the intensity to reach it: the loop underneath never changes', () => {
  function run(extra) {
    const { FakeContext, log } = recorder();
    const music = M.createMusic({ AudioContext: FakeContext });
    music.unlock();
    const g = playingGame(10, extra);
    play(music, log, g, TOTAL * M.stepSeconds(0) + 0.5);   // one whole loop
    return { music, log };
  }
  const calm = run({});
  const g = { score: { left: 5, right: 5 } };
  const peak = run(g);
  const tom = M.ARRANGEMENTS[10].kit.tom.freq;
  assert.strictEqual(calm.music.intensityNow, 0);
  assert.strictEqual(peak.music.intensityNow, M.INTENSITY.matchPoint);
  assert.strictEqual(oscAt(calm.log, tom).length, 0, 'no tom roll at the first serve');
  assert.ok(oscAt(peak.log, tom).length > 0, 'the tom roll plays at match point');
  const drop = M.ARRANGEMENTS[10].kit.tom.drop;
  assert.ok(oscAt(peak.log, tom).every((o) => o.frequency.writes.some((w) => w[0] === 'exp' && Math.abs(w[1] - tom * drop.ratio) < 0.01)),
    'and each tom falls in pitch as its kit piece says');
  assert.ok(peak.music.scheduled > calm.music.scheduled,
    `match point books more (${peak.music.scheduled}) than the first serve (${calm.music.scheduled})`);
  assert.strictEqual(calm.music.errors + peak.music.errors, 0);
});

test('a hand clap is three quick spikes before its decay', () => {
  const clap = M.ARRANGEMENTS[10].kit.clap;
  assert.strictEqual(clap.bursts, 3);
  const saved = M.ARRANGEMENTS[10];
  const { FakeContext, log } = recorder();
  try {
    M.ARRANGEMENTS[10] = { era: 10, voices: 8, kit: { clap }, chain: {},
                           parts: [{ play: 'drum', hit: 'clap', pattern: '. . . . x . . . . . . . x . . .' }] };
    const music = M.createMusic({ AudioContext: FakeContext });
    music.unlock();
    play(music, log, playingGame(10), 1);
    assert.strictEqual(music.errors, 0);
  } finally {
    M.ARRANGEMENTS[10] = saved;
  }
  const spiky = log.gains.filter((g) => g.gain.writes.filter((w) => w[0] === 'lin' && Math.abs(w[1] - clap.gain) < 1e-9).length === 3);
  assert.ok(spiky.length > 0, 'some gain ramps up to the clap three times');
});

// ------------------------------------------------------------ the period chain

test("each era's period chain is built between its effects and its bus, and let go of whole after the fade", () => {
  const { FakeContext, log } = recorder();
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  const g = playingGame(1);
  play(music, log, g, 0.3);
  // The Atari: a speaker's tone and a worn tape (a delay whose time wanders).
  const atari = M.ARRANGEMENTS[1].chain;
  assert.ok(log.filters.some((f) => f.type === 'lowpass' && f.frequency.value === atari.tone), 'the tone low-pass');
  const tape = log.delays.filter((d) => log.edges.some(([from, to]) => to === d.delayTime));
  assert.ok(tape.length > 0, 'the tape delay has something wandering its time (wow and flutter)');
  // The NES: a gated hall, an impulse gate seconds long.
  g.era = 2;
  const before = log.convolvers.length;
  play(music, log, g, 0.3);
  const hall = M.ARRANGEMENTS[2].chain.hall;
  const gated = log.buffers.find((b) => b.length === Math.floor(8000 * hall.gate));
  assert.ok(gated, `an impulse ${hall.gate} s long: the gated sound`);
  const flat = gated.getChannelData(0);
  const head = Math.max(...Array.from(flat.slice(0, 200), Math.abs));
  const tail = Math.max(...Array.from(flat.slice(-200), Math.abs));
  assert.ok(tail > head * 0.5, 'a gate holds its level and then stops dead, it does not fade');
  const nesHall = log.convolvers[before];
  assert.ok(nesHall && !nesHall.unplugged);
  // Up to the Genesis and past the fade: the NES's hall is unplugged with the rest of it.
  g.era = 3;
  play(music, log, g, M.FADE_S + 0.5);
  assert.ok(nesHall.unplugged, "the NES's gated hall is let go of once it has faded");
  const tapeLfos = tape.map((d) => log.edges.find(([, to]) => to === d.delayTime)[0]);
  assert.ok(tapeLfos.every((n) => n.unplugged), "and so is the Atari's tape");
  assert.strictEqual(music.errors, 0);
});

// ------------------------------------------------------------ the limiter

test('the master limiter: a fast hard compressor, then a ceiling nothing passes, then the speakers', () => {
  const { FakeContext, log } = recorder({ compressor: true });
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  const lim = music.limiter;
  assert.ok(lim && lim.compressor && lim.ceiling);
  const c = log.compressors[0];
  assert.strictEqual(c.threshold.value, M.LIMIT.threshold);
  assert.ok(c.ratio.value >= 12, 'hard enough to be a limiter');
  assert.ok(c.attack.value <= 0.005, 'fast enough to catch a crash');
  assert.ok(lim.compressor.outs.includes(lim.ceiling), 'compressor into the ceiling');
  assert.ok(lim.ceiling.outs.includes(log.ctx.destination), 'ceiling into the speakers');
  const master = log.gains.find((gn) => gn.outs.includes(lim.compressor));
  assert.ok(master, "the music's master feeds the limiter");
  assert.ok(!master.outs.includes(log.ctx.destination), 'and never goes round it');
});

test('a context with no compressor still gets the ceiling', () => {
  const { FakeContext, log } = recorder();
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  assert.strictEqual(music.limiter.compressor, null);
  assert.ok(music.limiter.ceiling.outs.includes(log.ctx.destination));
  assert.strictEqual(music.errors, 0);
});

test('the ceiling curve is straight through when quiet and never lets a sample past the ceiling', () => {
  const curve = M.ceilingCurve();
  const n = curve.length;
  const at = (x) => curve[Math.round((x + 1) / 2 * (n - 1))];
  assert.ok(Math.abs(at(0.3) - 0.3) < 0.002, 'a quiet sample passes as it is');
  assert.ok(Math.abs(at(-0.5) + 0.5) < 0.002);
  let peak = 0;
  for (let i = 1; i < n; i++) {
    assert.ok(curve[i] >= curve[i - 1], 'the curve never folds back');
    peak = Math.max(peak, Math.abs(curve[i]));
  }
  assert.ok(peak <= M.CEILING, `the loudest the curve ever sends is ${peak}, the ceiling ${M.CEILING}`);
  assert.ok(peak > M.CEILING * 0.95, 'and the headroom is used, not thrown away');
});
