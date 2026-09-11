'use strict';
/*
 * Headless tests for the soundtrack (src/music.js): the one theme, each era's
 * arrangement of it, and the player driven through a recording stand-in for
 * the Web Audio API -- no browser, no audio device.
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
function recorder() {
  const log = { contexts: 0, oscillators: [], gains: [], started: [], params: [] };
  function param(name) {
    const p = {
      name, value: 0, writes: [],
      setValueAtTime(v, t) { this.value = v; this.writes.push(['set', v, t]); },
      linearRampToValueAtTime(v, t) { this.writes.push(['lin', v, t]); },
      exponentialRampToValueAtTime(v, t) {
        if (!(v > 0)) throw new RangeError('exponential ramp to ' + v);
        this.writes.push(['exp', v, t]);
      },
      cancelScheduledValues() { this.writes.push(['cancel']); }
    };
    log.params.push(p);
    return p;
  }
  function node(kind) {
    return { kind, connect(to) { return to; }, disconnect() {} };
  }
  class FakeContext {
    constructor() {
      log.contexts += 1;
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
      o.setPeriodicWave = (w) => { o.periodic = w; };
      o.start = (t) => { log.started.push(t); };
      o.stop = () => {};
      log.oscillators.push(o);
      return o;
    }
    createGain() { const g = node('gain'); g.gain = param('gain'); log.gains.push(g); return g; }
    createBiquadFilter() { const f = node('filter'); f.frequency = param('f'); f.Q = param('q'); return f; }
    createDelay() { const d = node('delay'); d.delayTime = param('delay'); return d; }
    createConvolver() { return node('convolver'); }
    createWaveShaper() { return node('shaper'); }
    createPeriodicWave(real) { return { kind: 'periodic', real }; }
    createBuffer(ch, len) { const data = new Float32Array(len); return { getChannelData: () => data }; }
    createBufferSource() { const s = node('source'); s.start = (t) => { log.started.push(t); }; s.stop = () => {}; return s; }
  }
  return { FakeContext, log };
}

function playingGame(era) {
  return Pong.createGame({ rng: () => 0.5, phase: 'playing', era: era || 0 });
}

/** Every melody note the arrangement's `full` melody parts play: 'step:midi' strings. */
function melodyNotes(arr) {
  const out = [];
  M.arrange(arr).forEach((list, s) => list.forEach((e) => {
    const p = arr.parts[e.part];
    if (p.play === 'melody' && p.rule === 'full') e.midis.forEach((m) => out.push(s + ':' + (m - 12 * (p.octave || 0))));
  }));
  return out.sort();
}

// ------------------------------------------------------------- the table
test('the theme is well formed: 8 bars of 16 steps, an A and a B section, a bass note every half bar', () => {
  assert.deepStrictEqual(M.themeProblems(), []);
  assert.strictEqual(T.bars, 8);
  assert.deepStrictEqual(Object.keys(T.sections), ['A', 'B']);
  assert.strictEqual(T.bass.length, 16);
});

test('eras 0 to 4 are arranged and pass the table check; eras 5 to 10 are empty slots', () => {
  assert.strictEqual(M.ARRANGEMENTS.length, 11);
  for (let e = 0; e <= 4; e++) {
    assert.ok(M.ARRANGEMENTS[e], 'era ' + e + ' has an arrangement');
    assert.deepStrictEqual(M.arrangementProblems(M.ARRANGEMENTS[e]), [], 'era ' + e);
    assert.ok(M.ARRANGEMENTS[e].about && M.ARRANGEMENTS[e].trait, 'era ' + e + ' says what it sounds like and why');
  }
  for (let e = 5; e <= 10; e++) {
    assert.strictEqual(M.ARRANGEMENTS[e], null, 'era ' + e + ' is a slot');
    assert.strictEqual(M.arrangementFor(e), null);
  }
});

test('the table check catches a short bar and an unknown rule', () => {
  const bad = { parts: [{ play: 'bass', rule: 'wobble', voice: { wave: 'sine', gain: 0.1 } },
                        { play: 'drum', pattern: 'x . x', voice: { wave: 'noise', gain: 0.1 } }] };
  const found = M.arrangementProblems(bad).join(' | ');
  assert.match(found, /unknown rule wobble/);
  assert.match(found, /3 steps, want 16/);
});

test('one song, different clothes: every era that plays the whole melody plays the SAME notes on the same steps', () => {
  const theme = melodyNotes({ parts: [{ play: 'melody', rule: 'full', voice: { wave: 'sine', gain: 1 } }] });
  assert.ok(theme.length > 50);
  for (const e of [1, 2, 3, 4]) {
    assert.deepStrictEqual(melodyNotes(M.ARRANGEMENTS[e]), theme, 'era ' + e + ' keeps the melody, key and length');
  }
});

test('the arcade only taps the melody\'s bones: two short beeps a bar, each the first note of its half bar', () => {
  const arr = M.ARRANGEMENTS[0];
  const score = M.arrange(arr);
  const taps = [];
  score.forEach((list, s) => list.forEach((e) => taps.push({ s, m: e.midis[0], len: e.len })));
  assert.strictEqual(taps.length, T.bars * 2);
  const melody = T.melody.map(M.parseBar);
  taps.forEach((t) => {
    assert.strictEqual(t.s % 8, 0, 'on a half bar');
    const bar = Math.floor(t.s / 16), half = (t.s % 16) / 8;
    const first = melody[bar].slice(half * 8, half * 8 + 8).find((e) => e);
    assert.strictEqual(t.m, first.midis[0]);
    assert.strictEqual(t.len, 1);
  });
  assert.ok(arr.drone.some((d) => d.freq === 60), 'the 60 Hz hum');
  assert.ok(arr.drone.some((d) => d.wobble), 'the flickering buzz');
});

test('the Atari: never more than two notes at once, out of tune, and its drum steals the bass channel', () => {
  const arr = M.ARRANGEMENTS[1];
  const score = M.arrange(arr);
  const sounding = new Array(TOTAL).fill(0);
  score.forEach((list, s) => list.forEach((e) => {
    for (let k = 0; k < Math.max(1, Math.ceil(e.len)); k++) sounding[(s + k) % TOTAL] += 1;
  }));
  assert.ok(Math.max(...sounding) <= 2, 'max voices ' + Math.max(...sounding));
  score.forEach((list) => {
    const drum = list.some((e) => arr.parts[e.part].play === 'drum');
    const bass = list.some((e) => arr.parts[e.part].play === 'bass');
    assert.ok(!(drum && bass), 'a drum hit and a bass note never start together');
  });
  assert.strictEqual(arr.detune.length, 12);
  assert.ok(arr.detune.filter((c) => Math.abs(c) >= 8).length >= 8, 'most of the scale is off true');
  arr.parts.filter((p) => p.play !== 'drum').forEach((p) => assert.strictEqual(p.voice.wave, 'square'));
});

test('the NES: its pulse duty changes between sections, chords are fast arpeggios, the second pulse echoes the B section', () => {
  const arr = M.ARRANGEMENTS[2];
  const leads = arr.parts.filter((p) => p.play === 'melody');
  assert.deepStrictEqual(leads.map((p) => p.voice.wave).sort(), ['pulse12', 'pulse25']);
  const arp = arr.parts.find((p) => p.play === 'chords');
  assert.strictEqual(arp.rule, 'arp');
  assert.ok(arp.speed >= 2, 'faster than one note a step');
  assert.strictEqual(arp.voice.wave, 'pulse50');
  const echo = arr.parts.find((p) => p.play === 'echo');
  assert.deepStrictEqual(echo.sections, ['B']);
  assert.ok(echo.voice.gain < leads[0].voice.gain, 'the echo is quieter');
  assert.strictEqual(arr.parts.find((p) => p.play === 'bass').voice.wave, 'triangle');
  // Every arpeggio note is a tone of that bar's chord.
  const score = M.arrange(arr);
  const pi = arr.parts.indexOf(arp);
  score.forEach((list, s) => list.filter((e) => e.part === pi).forEach((e) => {
    const chord = T.chords[Math.floor(s / 16)].split('+').map(M.noteMidi).map((m) => m % 12);
    assert.ok(chord.includes(e.midis[0] % 12));
  }));
});

test('the Genesis: FM bass in sixteenths, an FM lead, a square on top, and grit', () => {
  const arr = M.ARRANGEMENTS[3];
  const score = M.arrange(arr);
  const bi = arr.parts.findIndex((p) => p.play === 'bass');
  const perBar = score.slice(0, 16).reduce((n, l) => n + l.filter((e) => e.part === bi).length, 0);
  assert.strictEqual(perBar, 16);
  assert.ok(arr.parts[bi].voice.fm && arr.parts.find((p) => p.play === 'melody').voice.fm);
  assert.strictEqual(arr.parts.find((p) => p.play === 'chords').voice.wave, 'square');
  assert.ok(arr.effects.grit > 0);
});

test('the Super Nintendo: a soft low-pass and the echo over strings, brass, marimba and choir', () => {
  const arr = M.ARRANGEMENTS[4];
  assert.ok(arr.effects.lowpass > 0 && arr.effects.lowpass < 8000);
  assert.ok(arr.effects.echo && arr.effects.echo.feedback > 0);
  const rules = arr.parts.map((p) => p.play + ':' + (p.rule || ''));
  for (const r of ['melody:full', 'chords:pad', 'chords:broken', 'bass:pizz']) assert.ok(rules.includes(r), r);
});

// ------------------------------------------------------------ the player
test('silent until the first click: nothing opens before unlock, and the title screen books nothing', () => {
  const { FakeContext, log } = recorder();
  const music = M.createMusic({ AudioContext: FakeContext });
  const g = playingGame(2);
  assert.strictEqual(music.update(g), 0);
  assert.strictEqual(log.contexts, 0);
  assert.ok(music.unlock());
  const title = Pong.createGame({ era: 2 });
  assert.strictEqual(music.update(title), 0);
  assert.ok(music.update(g) > 0);
});

test('?music=off, and a page with no AudioContext, stay silent without throwing', () => {
  assert.ok(M.offFromQuery('?era=2&music=off'));
  assert.ok(!M.offFromQuery('?era=2'));
  const { FakeContext, log } = recorder();
  const off = M.createMusic({ AudioContext: FakeContext, off: true });
  assert.strictEqual(off.unlock(), false);
  assert.strictEqual(off.update(playingGame(2)), 0);
  assert.strictEqual(log.contexts, 0);
  const none = M.createMusic({ AudioContext: null });
  assert.strictEqual(none.unlock(), false);
  assert.strictEqual(none.update(playingGame(2)), 0);
  assert.strictEqual(none.errors, 0);
});

test('notes are booked ahead on the audio clock, never past the lookahead window', () => {
  const { FakeContext, log } = recorder();
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  const g = playingGame(3);
  log.ctx.currentTime = 10;
  music.update(g);
  const horizon = 10 + M.LOOKAHEAD + M.stepSeconds(0);
  assert.ok(log.started.length > 0);
  log.started.forEach((t) => assert.ok(t >= 10 && t <= horizon, 'started at ' + t));
  const before = log.started.length;
  music.update(g);   // same moment: nothing new to book
  assert.strictEqual(log.started.length, before);
});

test('the music sits 12 dB under the effects', () => {
  const { FakeContext, log } = recorder();
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  const master = log.gains[0];
  assert.ok(Math.abs(master.gain.value - 0.5 * Math.pow(10, -12 / 20)) < 1e-9);
});

test('an era change cross-fades at the same bar and beat: the song position carries on', () => {
  const { FakeContext, log } = recorder();
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  const g = playingGame(1);
  for (let t = 0; t < 3; t += 0.05) { log.ctx.currentTime = t; music.update(g); }
  const before = music.position();
  assert.ok(before.bar * 16 + before.step > 0);
  g.era = 2;
  music.update(g);
  assert.strictEqual(music.crossfades, 1);
  assert.deepStrictEqual({ bar: music.lastSwitch.bar, step: music.lastSwitch.step }, before);
  assert.strictEqual(music.lastSwitch.from, 1);
  assert.strictEqual(music.lastSwitch.to, 2);
  // Over the ring both are heard; afterwards only the new one.
  for (let t = 3; t < 3 + M.FADE_S + 0.5; t += 0.05) { log.ctx.currentTime = t; music.update(g); }
  const after = music.position();
  assert.ok(after.bar * 16 + after.step !== 0 || before.bar * 16 + before.step > TOTAL - 40, 'did not restart');
});

test('back on the title screen the tune fades away and books nothing more', () => {
  const { FakeContext, log } = recorder();
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  const g = playingGame(0);   // the arcade: its hum is a drone that would run on
  music.update(g);
  assert.strictEqual(music.era, 0);
  g.phase = 'title';
  log.ctx.currentTime = 0.5;
  assert.strictEqual(music.update(g), 0);
  assert.strictEqual(music.era, null);
  const before = log.started.length;
  for (let t = 0.5; t < 3; t += 0.05) { log.ctx.currentTime = t; music.update(g); }
  assert.strictEqual(log.started.length, before, 'nothing new on the title screen');
});

test('the tempo climbs a little as a rally goes on, capped', () => {
  assert.ok(M.stepSeconds(10) < M.stepSeconds(0));
  assert.strictEqual(M.stepSeconds(100), M.stepSeconds(1000));
  const ratio = M.stepSeconds(0) / M.stepSeconds(1000);
  assert.ok(ratio > 1.1 && ratio < 1.25, 'top speed x' + ratio);
});

test('a paddle hit ducks the music once; M mutes and unmutes', () => {
  const { FakeContext } = recorder();
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  const g = playingGame(2);
  g.events = [{ type: 'paddle', era: 2 }];
  g.time = 1;
  music.update(g);
  music.update(g);   // the same step read twice ducks once
  assert.strictEqual(music.ducks, 1);
  assert.strictEqual(music.toggleMute(), true);
  assert.strictEqual(music.toggleMute(), false);
});

test('every arrangement plays through a whole loop on the stand-in with no errors', () => {
  for (let e = 0; e <= 10; e++) {
    const { FakeContext, log } = recorder();
    const music = M.createMusic({ AudioContext: FakeContext });
    music.unlock();
    const g = playingGame(e);
    const loop = TOTAL * M.stepSeconds(0);
    for (let t = 0; t < loop + 0.5; t += 0.05) { log.ctx.currentTime = t; music.update(g); }
    assert.strictEqual(music.errors, 0, 'era ' + e);
    if (e <= 4) assert.ok(music.scheduled > 0, 'era ' + e + ' sounded');
    else assert.strictEqual(music.scheduled, 0, 'era ' + e + ' is silent');
  }
});
