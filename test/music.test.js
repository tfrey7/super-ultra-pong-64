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
  const log = { contexts: 0, oscillators: [], gains: [], started: [], params: [], edges: [],
                shapers: [], panners: [], filters: [], stoppedNow: 0 };
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
    return {
      kind,
      connect(to) { log.edges.push([kind, to.kind || 'param:' + to.name]); return to; },
      disconnect() {}
    };
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
      o.stop = (t) => { if (t === undefined) log.stoppedNow += 1; };
      log.oscillators.push(o);
      return o;
    }
    createGain() { const g = node('gain'); g.gain = param('gain'); log.gains.push(g); return g; }
    createBiquadFilter() {
      const f = node('filter'); f.frequency = param('f'); f.Q = param('q'); log.filters.push(f); return f;
    }
    createDelay() { const d = node('delay'); d.delayTime = param('delay'); return d; }
    createConvolver() { return node('convolver'); }
    createWaveShaper() { const s = node('shaper'); log.shapers.push(s); return s; }
    createStereoPanner() { const p = node('panner'); p.pan = param('pan'); log.panners.push(p); return p; }
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

test('all eleven eras are arranged, pass the table check and say what they sound like and why', () => {
  assert.strictEqual(M.ARRANGEMENTS.length, 11);
  const names = ['1972 arcade', 'Atari 2600', 'NES', 'Genesis', 'Super Nintendo',
                 'PlayStation', 'Nintendo 64', 'Dreamcast', 'PlayStation 2', 'Xbox', 'Xbox 360'];
  for (let e = 0; e <= 10; e++) {
    assert.ok(M.ARRANGEMENTS[e], 'era ' + e + ' has an arrangement');
    assert.strictEqual(M.arrangementFor(e), M.ARRANGEMENTS[e]);
    assert.strictEqual(M.ARRANGEMENTS[e].name, names[e]);
    assert.deepStrictEqual(M.arrangementProblems(M.ARRANGEMENTS[e]), [], 'era ' + e);
    assert.ok(M.ARRANGEMENTS[e].about && M.ARRANGEMENTS[e].trait, 'era ' + e + ' says what it sounds like and why');
  }
  assert.deepStrictEqual(M.arrangementProblems(null), [], 'an empty slot is still allowed');
});

test('the table check catches a rhythm part with no pattern, an unknown voicing and a wild swing', () => {
  const bad = { swing: 0.7, parts: [{ play: 'chords', rule: 'rhythm', voicing: 'cluster', voice: { wave: 'sine', gain: 0.1 } }] };
  const found = M.arrangementProblems(bad).join(' | ');
  assert.match(found, /needs a pattern/);
  assert.match(found, /unknown voicing cluster/);
  assert.match(found, /swing/);
});

test('chord voicings stay in the key: power chords, and the key\'s own sevenths and ninths', () => {
  const n = (s) => s.split('+').map(M.noteMidi);
  assert.deepStrictEqual(M.keyScale(T), [9, 11, 0, 2, 4, 5, 7], 'A minor');
  assert.deepStrictEqual(M.voiceChord(n('A3+C4+E4'), 'power', T), n('A3+E4+A4'));
  assert.deepStrictEqual(M.voiceChord(n('A3+C4+E4'), 'seventh', T), n('A3+C4+E4+G4'));   // Am7
  assert.deepStrictEqual(M.voiceChord(n('F3+A3+C4'), 'seventh', T), n('F3+A3+C4+E4'));   // Fmaj7
  assert.deepStrictEqual(M.voiceChord(n('E3+G#3+B3'), 'seventh', T), n('E3+G#3+B3+D4')); // E7
  assert.deepStrictEqual(M.voiceChord(n('A3+C4+E4'), 'ninth', T), n('A3+C4+E4+G4+B4'));  // Am9
  assert.deepStrictEqual(M.voiceChord(n('C4+E4+G4'), 'triad', T), n('C4+E4+G4'));
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
  for (const e of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    assert.deepStrictEqual(melodyNotes(M.ARRANGEMENTS[e]), theme, 'era ' + e + ' keeps the melody, key and length');
  }
});

/** The melody as an arpeggio still lands every theme note on its own step (the arp's first, accented note). */
function arpOnsets(arr) {
  const out = new Set();
  M.arrange(arr).forEach((list, s) => list.forEach((e) => {
    const p = arr.parts[e.part];
    if (p.play === 'melody' && p.rule === 'arp' && e.accent) out.add(s + ':' + (e.midis[0] - 12 * (p.octave || 0)));
  }));
  return [...out].sort();
}

test('the Xbox 360 spins the melody into arpeggios, and every theme note still lands on its own beat', () => {
  const theme = melodyNotes({ parts: [{ play: 'melody', rule: 'full', voice: { wave: 'sine', gain: 1 } }] });
  const arr = M.ARRANGEMENTS[10];
  assert.deepStrictEqual(arpOnsets(arr), theme);
  // The B section's supersaw lead doubles the tune itself, on the same steps.
  const lead = melodyNotes({ parts: arr.parts.filter((p) => p.rule === 'full') });
  const bSteps = theme.filter((k) => Number(k.split(':')[0]) >= 4 * T.steps);
  assert.deepStrictEqual(lead, bSteps);
  // Between the melody's onsets the arp keeps moving: more notes than the tune has.
  const pi = arr.parts.findIndex((p) => p.rule === 'arp');
  let arpNotes = 0;
  M.arrange(arr).forEach((l) => { arpNotes += l.filter((e) => e.part === pi).length; });
  assert.ok(arpNotes > theme.length * 1.5, arpNotes + ' arp notes');
});

test('every era plays the theme at its own tempo and length: no arrangement changes the clock', () => {
  M.ARRANGEMENTS.forEach((arr, e) => {
    assert.strictEqual(M.arrange(arr).length, TOTAL, 'era ' + e);
    assert.ok(!('bpm' in arr) && !('bars' in arr) && !('key' in arr), 'era ' + e + ' carries no tempo, length or key of its own');
  });
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

// -------------------------------------------------- the 3D table, 5 to 10
const partsOf = (arr, play, rule) => arr.parts.filter((p) => p.play === play && (!rule || p.rule === rule));

test('the PlayStation: real seventh chords, a grainy crush, a resonant sweep over the mix, reverb and squelchy stabs', () => {
  const arr = M.ARRANGEMENTS[5];
  assert.ok(arr.effects.crush >= 6 && arr.effects.crush <= 10, 'a slightly grainy edge, not a chiptune');
  assert.ok(arr.effects.sweep.q >= 3 && arr.effects.sweep.depth > 1000, 'a resonant sweep that really moves');
  assert.ok(arr.effects.reverb.mix > 0, 'the SPU reverb');
  const pad = partsOf(arr, 'chords', 'pad')[0];
  assert.strictEqual(pad.voicing, 'seventh', 'the first era where a chord is a real chord');
  const stab = partsOf(arr, 'chords', 'rhythm')[0];
  assert.ok(stab.voice.filter.q >= 5 && stab.voice.filter.sweep.to < stab.voice.filter.freq, 'the stab squelches shut');
  assert.strictEqual(partsOf(arr, 'drum').filter((p) => p.voice && p.voice.wave === 'kick')[0].pattern.split(' ').filter((t) => t !== '.').length, 4, 'four on the floor');
});

test('the Nintendo 64: muffled at about 9 kHz, a fat string pad, brass stabs and a big reverb', () => {
  const arr = M.ARRANGEMENTS[6];
  assert.ok(arr.effects.lowpass >= 8000 && arr.effects.lowpass <= 10000, 'cartridge-squeezed samples');
  assert.ok(arr.effects.reverb.seconds >= 2.5 && arr.effects.reverb.mix >= 0.3, 'a big reverb');
  const pad = partsOf(arr, 'chords', 'pad')[0];
  assert.ok(pad.voice.unison.length >= 3 && pad.voice.wave === 'sawtooth', 'a fat string pad');
  const brass = partsOf(arr, 'chords', 'rhythm')[0];
  assert.ok(brass.voice.filter.sweep.to > brass.voice.filter.freq, 'the brass opens up as it speaks');
  assert.ok(brass.pattern.includes('X'), 'accented stabs');
});

test('the Dreamcast: full-band and crisp, jazzy ninth chords, a swung breakbeat with real cymbals', () => {
  const arr = M.ARRANGEMENTS[7];
  assert.ok(!arr.effects.lowpass && !arr.effects.crush && !arr.effects.grit, 'nothing muffles or crushes it');
  assert.ok(arr.swing > 0 && arr.swing < 0.25, 'a light swing');
  assert.strictEqual(partsOf(arr, 'chords', 'rhythm')[0].voicing, 'ninth');
  const drums = partsOf(arr, 'drum');
  assert.ok(drums.length >= 4, 'kick, snare, ride and crash');
  assert.ok(drums.some((p) => p.open && p.voice.env.d >= 0.8), 'a crash that rings at each section');
  const snare = drums.find((p) => p.voice.filter && p.voice.filter.type === 'bandpass');
  assert.ok(snare.pattern.split(' ').filter((t) => t === 'x').length >= 2, 'ghost notes: a breakbeat, not a backbeat');
  // Swing moves only the off-16ths, and never by a whole step.
  M.arrange(arr).forEach((l, s) => l.forEach((e) => {
    if (s % 2 === 0) assert.ok(e.at < 1);
    else assert.ok(e.at >= arr.swing - 1e-9);
  }));
});

test('the PlayStation 2: slow wide strings, a low drone that never stops, a deep pulse, dark and in a long hall', () => {
  const arr = M.ARRANGEMENTS[8];
  const strings = partsOf(arr, 'melody', 'full')[0];
  assert.ok(strings.voice.env.a >= 0.15 && strings.voice.spread > 0, 'slow strings, spread wide');
  assert.ok(arr.drone.some((d) => d.freq <= 60), 'a low drone');
  const pulse = partsOf(arr, 'bass', 'eighths')[0];
  assert.strictEqual(pulse.octave, -1, 'the pulse sits an octave under the bass line');
  assert.ok(arr.effects.lowpass <= 5000 && arr.effects.reverb.seconds >= 3, 'dark, and a long hall');
});

test('the Xbox: Halo\'s monk choir on the tune, then an overdriven lead and drop-tuned power chords spread wide at the climax', () => {
  const arr = M.ARRANGEMENTS[9];
  const choir = partsOf(arr, 'melody', 'full')[0];
  assert.ok(choir.voice.filter.type === 'bandpass' && !choir.from, 'the choir (a formant band-pass) carries the tune from the start');
  const lead = partsOf(arr, 'echo').find((p) => p.voice.drive);
  assert.ok(lead.voice.wave === 'sawtooth' && lead.voice.drive >= 0.5 && lead.from >= 0.7, 'a saw through a drive doubles the tune at the climax');
  const riffs = partsOf(arr, 'chords', 'rhythm');
  riffs.forEach((r) => assert.ok(r.from >= 0.7, 'the guitars are the climax'));
  const riff = riffs[0];
  riffs.forEach((r) => {
    assert.strictEqual(r.voicing, 'power');
    assert.ok(r.octave < 0 && r.voice.drive > 0, 'low and distorted');
  });
  assert.deepStrictEqual(riffs.map((r) => r.voice.pan).sort(), [-1, 1], 'double-tracked, hard left and hard right');
  assert.strictEqual(riffs[0].pattern, riffs[1].pattern, 'the two takes play the same riff');
  const score = M.arrange(arr);
  const pi = arr.parts.indexOf(riff);
  const lowest = Math.min(...score.flat().filter((e) => e.part === pi).map((e) => e.midis[0]));
  assert.ok(lowest <= M.noteMidi('E2'), 'the riff goes down to the low strings: ' + lowest);
  assert.ok(arr.kit.kick.gain >= 0.45 && partsOf(arr, 'drum').some((p) => p.hit === 'kick'), 'a heavy kick');
  assert.ok(partsOf(arr, 'drum').some((p) => p.hit === 'taiko' && p.from < 0.7), 'war drums in the build');
});

test('the Xbox 360: a tempo-locked wobble on the bass, pumping pads, the melody as arpeggios and a huge kick', () => {
  const arr = M.ARRANGEMENTS[10];
  const wob = partsOf(arr, 'bass').find((p) => p.voice.filter && p.voice.filter.lfo);
  assert.ok(wob.voice.filter.lfo.perBeat >= 1 && wob.voice.filter.lfo.depth >= 0.5 && wob.voice.filter.q >= 5);
  assert.ok(partsOf(arr, 'chords', 'pad')[0].voice.pump >= 0.5, 'side-chain pump on the pads');
  assert.strictEqual(partsOf(arr, 'melody', 'arp').length, 1);
  const kick = partsOf(arr, 'drum').find((p) => p.voice.wave === 'kick');
  assert.ok(kick.voice.gain >= 0.55 && kick.voice.env.d >= 0.25, 'a huge kick');
  assert.strictEqual(kick.pattern, 'X . . . X . . . X . . . X . . .', 'four on the floor');
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
    assert.ok(music.scheduled > 0, 'era ' + e + ' sounded');
  }
});

test('on the real player: the wobble, the pump, the drive, the stereo spread and the sweep are all wired', () => {
  function play(era, seconds) {
    const { FakeContext, log } = recorder();
    const music = M.createMusic({ AudioContext: FakeContext });
    music.unlock();
    const g = playingGame(era);
    // The wobble, the pump and the guitars are climax layers since item 1243:
    // play the Xbox and the 360 at match point, where a real match hears them.
    if (era >= 9) { g.score.left = 5; g.score.right = 5; }
    for (let t = 0; t < seconds; t += 0.05) { log.ctx.currentTime = t; music.update(g); }
    assert.strictEqual(music.errors, 0, 'era ' + era);
    return { log, music, g };
  }
  // Xbox 360: oscillators drive a filter's cutoff (the wobble) and a pad's gain dips every beat.
  const x360 = play(10, 2).log;
  assert.ok(x360.edges.some(([from, to]) => from === 'gain' && to === 'param:f'), 'an LFO moves a filter cutoff');
  const beat = M.stepSeconds(0) * 4;
  // A pump's gain starts at full (a note's envelope starts at silence) and dips on each beat.
  const pumps = x360.params.filter((p) => p.name === 'gain' && p.writes.length && p.writes[0][0] === 'set' &&
    p.writes[0][1] === 1 && p.writes.filter((w) => w[0] === 'set' && w[1] < 0.5).length >= 2);
  assert.ok(pumps.length > 0, 'a gain dips on beat after beat');
  const dips = pumps[0].writes.filter((w) => w[0] === 'set' && w[1] < 0.5).map((w) => w[2]);
  assert.ok(Math.abs((dips[1] - dips[0]) - beat) < 1e-6, 'one dip a beat');
  assert.ok(x360.panners.length > 0, 'the supersaws are spread');
  // Xbox: every riff note runs through an overdrive, left and right.
  const xbox = play(9, 1).log;
  assert.ok(xbox.shapers.length > 10, 'the guitars go through a drive');
  assert.ok(xbox.panners.some((p) => p.pan.value <= -0.8) && xbox.panners.some((p) => p.pan.value >= 0.8), 'hard left and hard right');
  // PlayStation: the sweep's LFO starts with the era and stops once it has faded out.
  const ps = play(5, 0.5);
  assert.ok(ps.log.edges.some(([from, to]) => from === 'gain' && to === 'param:f'), 'the sweep moves the mix filter');
  assert.ok(ps.log.shapers.length >= 1, 'the crush');
  const stoppedBefore = ps.log.stoppedNow;
  ps.g.era = 6;
  for (let t = 0.5; t < 0.5 + M.FADE_S + 0.5; t += 0.05) { ps.log.ctx.currentTime = t; ps.music.update(ps.g); }
  assert.ok(ps.log.stoppedNow > stoppedBefore, 'the sweep stops with its arrangement');
  assert.strictEqual(ps.music.crossfades, 1);
});

test('the Super Nintendo to the PlayStation, and the Xbox to the Xbox 360: the tune changes clothes at the same bar and beat', () => {
  for (const [from, to] of [[4, 5], [9, 10]]) {
    const { FakeContext, log } = recorder();
    const music = M.createMusic({ AudioContext: FakeContext });
    music.unlock();
    const g = playingGame(from);
    for (let t = 0; t < 2.3; t += 0.05) { log.ctx.currentTime = t; music.update(g); }
    const before = music.position();
    g.era = to;
    music.update(g);
    assert.deepStrictEqual({ bar: music.lastSwitch.bar, step: music.lastSwitch.step }, before);
    assert.strictEqual(music.lastSwitch.to, to);
    for (let t = 2.3; t < 2.3 + M.FADE_S + 0.3; t += 0.05) { log.ctx.currentTime = t; music.update(g); }
    assert.strictEqual(music.errors, 0);
  }
});

test('the rally speeds the 3D eras up too, wobble included: the wobble LFO follows the tempo', () => {
  function lfoRates(rally) {
    const { FakeContext, log } = recorder();
    const music = M.createMusic({ AudioContext: FakeContext });
    music.unlock();
    const g = playingGame(10);
    g.score.left = 5; g.score.right = 5;   // match point: the wobble is a climax layer (item 1243)
    g.rally = rally;
    for (let t = 0; t < 1; t += 0.05) { log.ctx.currentTime = t; music.update(g); }
    // A filter wobble's rate is perBeat / beat; the arrangement's is 2 a beat.
    return log.oscillators.map((o) => o.frequency.value).filter((f) => f > 1 && f < 20);
  }
  const calm = Math.max(...lfoRates(0)), fast = Math.max(...lfoRates(20));
  assert.ok(Math.abs(calm - 2 / (M.stepSeconds(0) * 4)) < 1e-6, 'two wobbles a beat at the theme tempo: ' + calm);
  assert.ok(fast > calm * 1.1, 'faster in a long rally: ' + fast + ' vs ' + calm);
});
