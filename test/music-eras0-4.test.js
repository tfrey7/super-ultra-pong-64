'use strict';
/*
 * Item 1242: eras 0 to 4, each checked against the music direction sheet
 * itself (docs/MUSIC.md) -- the theme's tempo and bar count, the era's year
 * and its chip's voice count are read out of the sheet's own words, so the
 * sheet and the arrangement cannot drift apart without this file saying so.
 * Each era also has to build: more of it plays at the climax than in the
 * build, and more in the build than at the first serve, and its climax is
 * bigger than the loop it replaced.
 *
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const M = require('../src/music.js');

const SHEET = fs.readFileSync(path.join(__dirname, '..', 'docs', 'MUSIC.md'), 'utf8');
const WORDS = { eight: 8, sixteen: 16 };

/** The theme as the sheet states it: "A minor, 132 bpm, eight bars of sixteen steps". */
function sheetTheme() {
  const m = /(\d+)\s+bpm,\s+(\w+)\s+bars\s+of\s+(\w+)\s+steps/.exec(SHEET);   // the sheet wraps its lines
  assert.ok(m, 'the sheet states the tempo and the length');
  return { bpm: Number(m[1]), bars: WORDS[m[2]] || Number(m[2]), steps: WORDS[m[3]] || Number(m[3]) };
}

/** One era's section of the sheet: its year and its "**Voices: N.**" line. */
function sheetEra(era) {
  const start = SHEET.search(new RegExp('^## Era ' + era + ': ', 'm'));
  assert.ok(start !== -1, 'the sheet has a section for era ' + era);
  const rest = SHEET.slice(start + 1);
  const end = rest.search(/^## /m);
  const text = end === -1 ? rest : rest.slice(0, end);
  const year = /^# Era \d+: (\d{4})/.exec(text);
  const voices = /\*\*Voices: (\d+)\.\*\*/.exec(text);
  assert.ok(year && voices, 'era ' + era + "'s section names its year and its voices");
  return { year: Number(year[1]), voices: Number(voices[1]), text };
}

/** Notes one pass of the loop plays at an intensity, the way the player books them. */
function notesAt(arr, intensity) {
  let n = 0;
  M.arrange(arr, M.THEME, { lift: true }).forEach((list) => list.forEach((e) => { if (e.from <= intensity) n += 1; }));
  return n;
}

/** The stages of the sheet's section plan: intro 0-0.3, build 0.3-0.7, climax 0.7-1. */
const INTRO = 0, BUILD = 0.5, CLIMAX = 0.8, MATCH_POINT = 1;

// What each era's loop played before item 1242, at every intensity alike
// (docs/measure/item1242/layers-master.json): the climax has to beat it.
const TONIGHT = [16, 125, 369, 397, 177];

/** The checks every era owes the sheet; answers the arrangement. */
function againstTheSheet(era) {
  const arr = M.ARRANGEMENTS[era];
  const want = sheetTheme();
  const sheet = sheetEra(era);
  // tempo and bar count: the one clock every era shares
  assert.strictEqual(M.THEME.bpm, want.bpm, 'the theme plays at the sheet\'s tempo');
  assert.strictEqual(M.THEME.bars, want.bars);
  assert.strictEqual(M.THEME.steps, want.steps);
  assert.ok(!('bpm' in arr) && !('bars' in arr) && !('steps' in arr), 'era ' + era + ' carries no clock of its own');
  const score = M.arrange(arr);
  assert.strictEqual(score.length / M.THEME.steps, want.bars, 'era ' + era + "'s loop is the sheet's " + want.bars + ' bars');
  // the year and the chip's voices
  assert.strictEqual(arr.year, sheet.year, 'era ' + era + ' stands for the sheet\'s year');
  assert.strictEqual(arr.voices, sheet.voices, 'era ' + era + ' has the sheet\'s ' + sheet.voices + ' voices');
  assert.ok(M.peakVoices(score, arr) <= sheet.voices, 'era ' + era + ' never sounds more than ' + sheet.voices + ' at once');
  assert.ok(!score.dropped, 'the whole climax fits the chip: nothing of the arrangement\'s own is dropped');
  assert.deepStrictEqual(M.arrangementProblems(arr), []);
  // the build: intro < build < climax <= match point, and bigger than tonight's loop
  const intro = notesAt(arr, INTRO), build = notesAt(arr, BUILD), climax = notesAt(arr, CLIMAX), top = notesAt(arr, MATCH_POINT);
  assert.ok(intro < build && build < climax && climax <= top,
    `era ${era} builds: ${intro} notes a loop at the serve, ${build} in the build, ${climax} at the climax, ${top} at match point`);
  assert.ok(climax > TONIGHT[era] * 1.3, `era ${era}'s climax (${climax}) is well past tonight's loop (${TONIGHT[era]})`);
  assert.ok(arr.parts.some((p) => p.from >= 0.3 && p.from < 0.7), 'a layer joins in the build');
  assert.ok(arr.parts.some((p) => p.from >= 0.7), 'a layer joins at the climax');
  // drums from era 1 on, by the build
  const drumsByBuild = arr.parts.some((p) => p.play === 'drum' && p.hit && !(p.from > BUILD));
  if (era === 0) assert.ok(!arr.kit, 'the 1972 cabinet has no drum kit');
  else assert.ok(drumsByBuild, 'era ' + era + "'s kit is playing by the build");
  return { arr, score, sheet };
}

/** Steps (0..15) a drum pattern hits on, its fill's too. */
function hitSteps(part) {
  const on = (pat) => (pat ? pat.split(/\s+/).map((t, i) => (t === '.' ? -1 : i)).filter((i) => i >= 0) : []);
  return { pattern: on(part.pattern), fill: on(part.fill || part.pattern) };
}
function disjoint(parts) {
  for (const key of ['pattern', 'fill']) {
    const seen = new Set();
    for (const p of parts) for (const s of hitSteps(p)[key]) {
      if (seen.has(s)) return false;
      seen.add(s);
    }
  }
  return true;
}

/** A silent stand-in for the Web Audio API on a clock the test moves: every node and param, nothing else. */
function silentContext(clock) {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {},
    exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exponential ramp to ' + v); } });
  const node = (extra) => Object.assign({ connect(to) { return to; }, disconnect() {}, start() {}, stop() {} }, extra);
  return class {
    constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = node(); }
    get currentTime() { return clock.now; }
    createOscillator() { return node({ frequency: param(), detune: param(), setPeriodicWave() {} }); }
    createGain() { return node({ gain: param() }); }
    createBiquadFilter() { return node({ frequency: param(), Q: param() }); }
    createDelay() { return node({ delayTime: param() }); }
    createConvolver() { return node(); }
    createWaveShaper() { return node(); }
    createStereoPanner() { return node({ pan: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createPeriodicWave() { return {}; }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
    createBufferSource() { return node(); }
  };
}

test('up the ladder from the cabinet to the PlayStation, every change cross-fades at the bar and beat the tune had reached', () => {
  const clock = { now: 0 };
  const music = M.createMusic({ AudioContext: silentContext(clock) });
  music.unlock();
  const game = { phase: 'playing', era: 0, rally: 6, score: { left: 0, right: 0 }, rules: { matchPoints: 11 }, events: [], time: 0 };
  for (let era = 0; era <= 5; era++) {
    const before = music.position();
    game.era = era;
    game.score.left = era;   // a point per rung, as in a real match
    const booked = music.scheduled;
    for (let t = 0; t < 2.5; t += 0.05) { clock.now += 0.05; game.time += 0.05; music.update(game); }
    assert.ok(music.scheduled > booked, 'era ' + era + ' books notes of its own');
    if (era > 0) {
      assert.deepStrictEqual({ bar: music.lastSwitch.bar, step: music.lastSwitch.step }, before,
        `the change into era ${era} starts at the bar and beat era ${era - 1} had reached`);
      assert.strictEqual(music.lastSwitch.from, era - 1);
    }
    assert.strictEqual(music.era, era);
  }
  assert.strictEqual(music.crossfades, 5);
  assert.strictEqual(music.errors, 0, 'every era 0-4 note booked cleanly on the audio clock');
});

test('era 0, the 1972 cabinet, against the sheet: one beeper, and its blips quicken toward match point', () => {
  const { arr } = againstTheSheet(0);
  assert.ok(arr.parts.filter((p) => p.play !== 'drum').every((p) => p.rule === 'bones'), 'the melody is only ever hinted');
  const blips = arr.parts.filter((p) => p.play === 'drum');
  assert.deepStrictEqual(blips.map((p) => p.from), [0.3, 0.7, 0.9], 'a tap every beat, then eighths, then the pickup');
  assert.ok(blips.every((p) => p.voice.wave === 'square'), 'the board\'s own square blips, no drums');
});

test('era 1, the Atari 2600, against the sheet: two voices, disco under a fanfare pickup, every drum stealing the bass', () => {
  const { arr, score } = againstTheSheet(1);
  const kick = arr.parts.find((p) => p.hit === 'kick'), snare = arr.parts.find((p) => p.hit === 'snare' && p.from === 0.3);
  assert.ok(kick && !kick.from && kick.steals === 'bass', 'the kick is there from the serve, on the bass channel');
  assert.ok(snare && snare.steals === 'bass', 'the snare hiss joins in the build');
  const floor = new Set([...hitSteps(kick).pattern, ...hitSteps(snare).pattern]);
  assert.deepStrictEqual([...floor].sort((a, b) => a - b), [0, 4, 8, 12], 'four on the floor');
  const pickup = arr.parts.find((p) => p.play === 'drum' && p.voice && p.voice.wave === 'square');
  assert.deepStrictEqual(hitSteps(pickup).fill, [13, 14, 15], 'a triplet-style pickup into each section');
  assert.strictEqual(arr.parts.find((p) => p.play === 'bass').rule, 'octaves', 'the octave disco bass');
  // two channels: a drum never starts with a bass note
  score.forEach((list) => {
    const drum = list.some((e) => arr.parts[e.part].play === 'drum');
    const bass = list.some((e) => arr.parts[e.part].play === 'bass');
    assert.ok(!(drum && bass));
  });
});

test('era 2, the NES, against the sheet: five channels, the kit shared out over the noise and sample channels', () => {
  const { arr } = againstTheSheet(2);
  const noise = arr.parts.filter((p) => p.hit === 'hat' || p.hit === 'snare');
  const dpcm = arr.parts.filter((p) => p.hit === 'kick' || p.hit === 'dpcm');
  assert.ok(noise.length >= 3 && disjoint(noise), 'hats and snare hiss take turns on the one noise channel');
  assert.ok(dpcm.length >= 3 && disjoint(dpcm), 'kick, sampled snare and fill take turns on the one DPCM channel');
  assert.ok(noise.every((p) => !hitSteps(p).pattern.includes(0)), 'the noise channel leaves every downbeat free for the crash');
  const arp = arr.parts.find((p) => p.play === 'chords');
  assert.ok(arp.rule === 'arp' && arp.speed >= 4, 'the arpeggio whirs');
  assert.ok(arr.parts.find((p) => p.play === 'echo').from === 0.3, 'the second pulse answers the tune from the build');
  assert.ok(arr.parts.some((p) => p.hit === 'dpcm' && p.from >= 0.7 && p.fill), 'a sampled fill rolls in at the climax');
});

test('era 3, the Genesis, against the sheet: FM bass, brass and piano over a house beat, the PSG square on top', () => {
  const { arr } = againstTheSheet(3);
  const kick = arr.parts.find((p) => p.hit === 'kick');
  assert.deepStrictEqual(hitSteps(kick).pattern, [0, 4, 8, 12], 'a house kick on every beat from the serve');
  const piano = arr.parts.find((p) => p.play === 'chords');
  assert.ok(piano.voice.fm && piano.voice.fm.ratio >= 10 && piano.from === 0.3, 'the bell-toothed FM piano joins in the build');
  assert.ok(arr.parts.some((p) => p.hit === 'open' && p.from === 0.3), 'the open hat on the "and"s');
  assert.ok(Array.isArray(arr.kit.snare) && arr.kit.snare.some((v) => v.bursts), 'a clap layered on the snare');
  const square = arr.parts.find((p) => p.play === 'melody' && p.voice.wave === 'square');
  assert.ok(square && square.octave === 1 && square.from === 0.7, 'the PSG square doubles the tune an octave up at the climax');
  assert.ok(arr.swing > 0 && arr.swing < 0.2, 'a new jack swing on the sixteenths');
  // the loop leaves a voice for the engine's tom and crash
  assert.ok(M.peakVoices(M.arrange(arr), arr) < arr.voices);
});

test('era 4, the Super Nintendo, against the sheet: flute, strings and pizz, then horns, harp and timpani, then the choir', () => {
  const { arr } = againstTheSheet(4);
  const at = (i) => arr.parts.filter((p) => (p.from || 0) === i);
  assert.deepStrictEqual(at(0).map((p) => p.play + ':' + p.rule), ['melody:full', 'chords:pad', 'bass:pizz'], 'the intro: flute, strings, pizzicato');
  const horns = arr.parts.find((p) => p.play === 'melody' && p.octave === -1);
  assert.ok(horns && horns.from === 0.3 && horns.voice.filter.sweep, 'the horns take the tune an octave under in the build');
  assert.ok(arr.parts.some((p) => p.hit === 'timpani' && p.from === 0.3), 'the timpani enters in the build');
  const choir = arr.parts.find((p) => p.play === 'chords' && p.voice.filter && p.voice.filter.type === 'bandpass');
  assert.ok(choir && choir.from === 0.7, 'the choir, a formant "ah", at the climax');
  assert.ok(arr.parts.some((p) => p.hit === 'timpani' && p.from === 0.7 && p.fill), 'a timpani roll into each section');
  // at match point the engine's cymbal lands on every downbeat
  const lifted = M.arrange(arr, M.THEME, { lift: true });
  let crashes = 0;
  for (let bar = 0; bar < M.THEME.bars; bar++) {
    if (lifted[bar * M.THEME.steps].some((e) => e.from === 0.9 && e.voice === arr.kit.crash)) crashes += 1;
  }
  assert.strictEqual(crashes, M.THEME.bars);
});
