'use strict';
/*
 * The six 3D-table arrangements (item 1243), PlayStation to Xbox 360, held to
 * docs/MUSIC.md: one check per era for its bar count, its tempo and its voice
 * count against the sheet, its intro, build and climax as intensity layers on
 * the era's own kit, and that each is bigger than the loop it replaced. Then
 * the cross-fade on the beat from the Super Nintendo up through every change
 * to the 360, at the intensity a real match reaches each rung with.
 *
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Pong = require('../src/game.js');
const M = require('../src/music.js');

const T = M.THEME;
const TOTAL = T.steps * T.bars;
const SHEET = fs.readFileSync(path.join(__dirname, '..', 'docs', 'MUSIC.md'), 'utf8');

/** One era's section of the sheet, from its "## Era N:" heading to the next. */
function sheetSection(era) {
  const start = SHEET.indexOf('## Era ' + era + ':');
  assert.ok(start >= 0, 'the sheet has a section for era ' + era);
  const next = SHEET.indexOf('\n## ', start + 4);
  return SHEET.slice(start, next < 0 ? SHEET.length : next);
}

/**
 * Tonight's loops, the ones these arrangements replaced (master d3a2276, item
 * 1241's files moved over unchanged): notes in one loop and the most voices
 * sounding at once. Every new arrangement at full intensity beats both.
 */
const TONIGHT = {
  5: { events: 247, peak: 7 }, 6: { events: 141, peak: 8 }, 7: { events: 357, peak: 11 },
  8: { events: 165, peak: 4 }, 9: { events: 451, peak: 11 }, 10: { events: 280, peak: 7 }
};

/** The score the player books (the engine's lifts included), keeping the events at or under intensity i. */
function heard(arr, i) {
  return M.arrange(arr, T, { lift: true }).map((list) => list.filter((e) => e.from <= i));
}
const count = (score) => score.reduce((n, l) => n + l.length, 0);

for (const era of [5, 6, 7, 8, 9, 10]) {
  test(`era ${era}: bar count, tempo and voice count match the sheet, the intro builds to a climax on the era's own kit, bigger than tonight's loop`, () => {
    const arr = M.ARRANGEMENTS[era];
    const sec = sheetSection(era);
    assert.deepStrictEqual(M.arrangementProblems(arr), [], 'a clean arrangement');

    // Bar count: the one loop, eight bars of sixteen steps, every part in it.
    const score = M.arrange(arr, T, { lift: true });
    assert.strictEqual(score.length, TOTAL);
    assert.strictEqual(TOTAL, 8 * 16);
    arr.parts.forEach((p, i) => assert.ok(score.some((l) => l.some((e) => e.part === i)), `part ${i + 1} (${p.play}) plays in the loop`));

    // Tempo: the sheet's one tempo, and no arrangement carries a clock of its own.
    const bpm = Number(/(\d+) bpm/.exec(SHEET)[1]);
    assert.strictEqual(T.bpm, bpm, 'the theme plays at the sheet\'s ' + bpm + ' bpm');
    assert.ok(!('bpm' in arr) && !('bars' in arr) && !('steps' in arr), 'no tempo or length of its own');
    assert.ok(Math.abs(TOTAL * M.stepSeconds(0) - 8 * 4 * 60 / bpm) < 1e-9, 'the loop lasts eight bars at the sheet\'s tempo');

    // Voice count: the sheet's number is the file's, and the climax with the
    // engine's lifts on top sounds no more than that and drops nothing.
    const voices = Number(/\*\*Voices: (\d+)\.?\*\*/.exec(sec)[1]);
    assert.strictEqual(arr.voices, voices, `the sheet gives era ${era} ${voices} voices`);
    assert.strictEqual(arr.year, Number(/^## Era \d+: (\d{4})/.exec(sec)[1]), 'the sheet\'s year');
    const all = M.arrange(Object.assign({}, arr, { voices: 0 }), T, { lift: true });
    assert.ok(M.peakVoices(all, arr) <= voices, `the climax fits the chip (${M.peakVoices(all, arr)} of ${voices})`);
    assert.ok(!score.dropped, `nothing dropped (${score.dropped || 0})`);

    // The sheet's plan: an intro, a build (0.3 to 0.7) and a climax (0.7 up).
    const intro = arr.parts.filter((p) => !p.from);
    const build = arr.parts.filter((p) => p.from >= 0.3 && p.from < 0.7);
    const climax = arr.parts.filter((p) => p.from >= 0.7);
    assert.ok(intro.some((p) => p.play === 'melody' || p.play === 'echo'), 'the tune is there from the first serve');
    assert.ok(build.length >= 2, `the build adds layers (${build.length})`);
    assert.ok(climax.length >= 2, `the climax adds layers (${climax.length})`);
    // The layers rise with the intensity: the serve, a rally, match point, the finale.
    const at = [0, 0.3, 0.7, 0.9, 1].map((i) => count(heard(arr, i)));
    for (let k = 1; k < at.length - 1; k++) assert.ok(at[k] > at[k - 1], `more plays at each stage: ${at.join(' < ')}`);
    assert.ok(at[4] >= at[3], 'the finale holds everything');

    // That year's drums: the arrangement plays the era's own kit, pieces named.
    const hits = new Set(arr.parts.filter((p) => p.play === 'drum' && p.hit).map((p) => p.hit));
    assert.ok(hits.size >= 2, `plays at least two kit pieces (${[...hits].join(', ')})`);
    hits.forEach((h) => assert.ok(arr.kit[h], `the kit has its ${h}`));

    // Bigger than tonight's loop: more notes and more voices at once.
    const full = M.arrange(Object.assign({}, arr, { voices: 0 }));
    assert.ok(count(full) > TONIGHT[era].events * 1.5, `${count(full)} notes a loop against tonight's ${TONIGHT[era].events}`);
    assert.ok(M.peakVoices(full, arr) > TONIGHT[era].peak, `${M.peakVoices(full, arr)} voices at once against tonight's ${TONIGHT[era].peak}`);
  });
}

test('the Xbox 360 is the biggest arrangement of the eleven', () => {
  const size = M.ARRANGEMENTS.map((a) => (a ? a.parts.length : 0));
  assert.strictEqual(Math.max(...size), size[10], `parts per era: ${size.join(', ')}`);
  const x = M.ARRANGEMENTS[10];
  assert.ok(x.kit.taiko && x.parts.some((p) => p.hit === 'taiko' && p.from >= 0.7), 'the taiko ensemble at the climax');
  assert.ok(x.parts.some((p) => p.voice && p.voice.filter && p.voice.filter.type === 'bandpass' && p.from >= 0.7), 'the choir');
  assert.ok(x.parts.some((p) => p.voice && p.voice.freq > 900 && p.voice.fm && p.sections && p.sections[0] === 'B'), 'the achievement chime on the turnaround');
});

// ---------------------------------------------------------- the cross-fade
/** A stand-in AudioContext that makes no sound; `box.ctx` is the one the player made. */
function fakeContext() {
  const box = {};
  const param = () => ({ value: 0, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime() {},
                         exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exp to ' + v); },
                         cancelScheduledValues() {} });
  const node = () => ({ connect(to) { return to; }, disconnect() {} });
  class FakeContext {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = node(); box.ctx = this; }
    createOscillator() { return Object.assign(node(), { frequency: param(), detune: param(), setPeriodicWave() {}, start() {}, stop() {} }); }
    createGain() { return Object.assign(node(), { gain: param() }); }
    createBiquadFilter() { return Object.assign(node(), { frequency: param(), Q: param() }); }
    createDelay() { return Object.assign(node(), { delayTime: param() }); }
    createConvolver() { return node(); }
    createWaveShaper() { return node(); }
    createStereoPanner() { return Object.assign(node(), { pan: param() }); }
    createPeriodicWave() { return {}; }
    createBuffer(ch, len) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { getChannelData: (c) => d[c] }; }
    createBufferSource() { return Object.assign(node(), { start() {}, stop() {} }); }
  }
  return { FakeContext, box };
}

test('from the Super Nintendo up to the Xbox 360, every change cross-fades at the same bar and beat, at the intensity a real match brings', () => {
  const { FakeContext, box } = fakeContext();
  const music = M.createMusic({ AudioContext: FakeContext });
  music.unlock();
  const g = Pong.createGame({ rng: () => 0.5, phase: 'playing', era: 4 });
  let t = 0;
  function run(seconds) {
    for (const end = t + seconds; t < end; t += 0.05) { box.ctx.currentTime = t; g.time = t; music.update(g); }
  }
  const booked = {};
  for (let era = 4; era <= 10; era++) {
    // A real match reaches era N after N points: the score's share of the build.
    g.score.left = Math.ceil(era / 2); g.score.right = Math.floor(era / 2);
    const before = music.position();
    g.era = era;
    const s0 = music.scheduled;
    music.update(g);
    if (era > 4) {
      assert.deepStrictEqual({ bar: music.lastSwitch.bar, step: music.lastSwitch.step }, before, `the change into era ${era} keeps the song's place`);
      assert.strictEqual(music.lastSwitch.to, era);
    }
    run(2.2);
    booked[era] = music.scheduled - s0;
  }
  assert.strictEqual(music.crossfades, 6);
  assert.ok(music.intensityNow >= M.INTENSITY.matchPoint, 'the 360 arrives at match point: ' + music.intensityNow);
  assert.ok(booked[10] > booked[5], `the 360 at match point books more (${booked[10]}) than the PlayStation (${booked[5]})`);
  assert.strictEqual(music.errors, 0);
});
