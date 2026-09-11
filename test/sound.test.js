'use strict';
/*
 * Headless tests for the sound: the rules' per-step event list, each era's
 * voice design, and the player driven through a recording stand-in for the
 * Web Audio API -- so none of this needs a browser or an audio device.
 *
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert');
const Pong = require('../src/game.js');
const PongSound = require('../src/sound.js');

function newGame(era) {
  return Pong.createGame({ rng: () => 0.5, phase: 'playing', era: era || 0 });
}

function placeBall(g, x, y, vx, vy) {
  g.serveDelay = 0;
  g.ball.x = x; g.ball.y = y; g.ball.vx = vx; g.ball.vy = vy;
}

/**
 * A stand-in AudioContext that records every node it is asked for and every
 * connection made, and makes no sound. Enough of the real surface for the
 * player: oscillators, gains, a delay, AudioParams with their ramps.
 */
function recorder() {
  const log = { contexts: 0, oscillators: [], gains: [], delays: [], edges: [], started: 0 };
  function param(owner, name) {
    return {
      owner, name, value: 0,
      setValueAtTime(v) { this.value = v; },
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exponential ramp to ' + v); }
    };
  }
  function node(kind) {
    const n = { kind, connect(to) { log.edges.push({ from: n, to }); return to; } };
    return n;
  }
  class FakeContext {
    constructor() {
      log.contexts += 1;
      this.currentTime = 0;
      this.state = 'running';
      this.destination = node('destination');
    }
    createOscillator() {
      const o = node('oscillator');
      o.type = 'sine';
      o.frequency = param(o, 'frequency');
      o.start = () => { log.started += 1; };
      o.stop = () => {};
      log.oscillators.push(o);
      return o;
    }
    createGain() {
      const g = node('gain');
      g.gain = param(g, 'gain');
      log.gains.push(g);
      return g;
    }
    createDelay() {
      const d = node('delay');
      d.delayTime = param(d, 'delayTime');
      log.delays.push(d);
      return d;
    }
  }
  return { FakeContext, log };
}

// ------------------------------------------------------- the rules' event list
test('a paddle hit is noted on the step\'s event list, with its side and era', () => {
  const g = newGame(2);
  const p = g.left;
  p.y = g.height / 2 - p.h / 2;
  placeBall(g, p.x + p.w + 2, g.height / 2 - g.ball.size / 2, -300, 0);
  Pong.step(g, 0.05, {});
  const hits = g.events.filter((e) => e.type === 'paddle');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].side, 'left');
  assert.strictEqual(hits[0].era, 2);
});

test('a wall bounce is noted on the event list', () => {
  const g = newGame();
  placeBall(g, g.width / 2, 2, 200, -300);
  Pong.step(g, 0.05, {});
  assert.deepStrictEqual(g.events.map((e) => [e.type, e.side]), [['wall', 'top']]);
});

test('a point is noted with the era it moved the machine up to', () => {
  const g = newGame(0);
  placeBall(g, g.width - 2, g.height / 2, 400, 0);
  g.right.y = 20;
  Pong.step(g, 0.05, {});
  const pts = g.events.filter((e) => e.type === 'score');
  assert.strictEqual(pts.length, 1);
  assert.strictEqual(pts[0].side, 'left');
  assert.strictEqual(pts[0].era, 1, 'the first point sounds on the Atari');
});

test('the event list only ever holds the last step, and the title screen makes none', () => {
  const g = newGame();
  placeBall(g, g.width / 2, 2, 200, -300);
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.events.length, 1);
  Pong.step(g, 0.001, {});
  assert.strictEqual(g.events.length, 0, 'emptied at the start of the next step');

  const t = Pong.createGame({ rng: () => 0.5 });
  for (let i = 0; i < 200; i++) Pong.step(t, 0.05, {});
  assert.strictEqual(t.phase, 'title');
  assert.deepStrictEqual(t.events, []);
});

// ------------------------------------------------------------ the era design
const TYPES = ['paddle', 'wall', 'score'];
const waves = (era, type) => PongSound.voicesFor(era, type).map((v) => v.wave);

test('the arcade machine and the Atari each play one square-wave blip', () => {
  for (const era of [0, 1]) {
    for (const type of TYPES) {
      const vs = PongSound.voicesFor(era, type);
      assert.strictEqual(vs.length, 1, `era ${era} ${type}: one voice`);
      assert.strictEqual(vs[0].wave, 'square');
      assert.ok(!vs[0].fm, 'no FM on the old boards');
    }
    assert.strictEqual(PongSound.echoFor(era), null);
  }
});

test('the NES plays square and triangle chiptune notes, and nothing else', () => {
  const all = new Set();
  for (const type of TYPES) {
    for (const w of waves(2, type)) all.add(w);
    for (const v of PongSound.voicesFor(2, type)) assert.ok(!v.fm);
  }
  assert.deepStrictEqual([...all].sort(), ['square', 'triangle']);
  assert.ok(waves(2, 'paddle').includes('square') && waves(2, 'paddle').includes('triangle'),
    'a paddle hit is pulse lead over triangle bass');
  assert.strictEqual(PongSound.echoFor(2), null);
});

test('the Genesis plays an FM tone for every sound', () => {
  for (const type of TYPES) {
    const vs = PongSound.voicesFor(3, type);
    assert.ok(vs.length >= 1);
    for (const v of vs) {
      assert.ok(v.fm && v.fm.ratio > 1 && v.fm.index > 0, `era 3 ${type} is FM`);
    }
  }
  assert.strictEqual(PongSound.echoFor(3), null);
});

test('the Super Nintendo layers several voices per sound and adds a short echo', () => {
  for (const type of TYPES) {
    assert.ok(PongSound.voicesFor(4, type).length >= 2, `era 4 ${type} is layered`);
  }
  const echo = PongSound.echoFor(4);
  assert.ok(echo, 'era 4 has an echo');
  assert.ok(echo.time > 0 && echo.time < 0.5, 'a SHORT echo');
  assert.ok(echo.feedback > 0 && echo.feedback < 1, 'that dies away');
});

test('the sound ladder has a rung for every era the rules know', () => {
  assert.strictEqual(PongSound.TOP_ERA, Pong.TOP_ERA);
  for (const e of Pong.ERAS) {
    for (const type of TYPES) assert.ok(PongSound.voicesFor(e.era, type).length >= 1, `era ${e.era} ${type} sounds`);
  }
  assert.deepStrictEqual(waves(99, 'paddle'), waves(Pong.TOP_ERA, 'paddle'), 'past the top is the top');
  assert.deepStrictEqual(PongSound.voicesFor(0, 'serve'), [], 'an event with no sound plays nothing');
});

test('a rung above the VOICES rows keeps its voice on its look, and one with no voice yet plays the top row', () => {
  const path = require('node:path');
  const { R } = require('../tools/eralooks.js').loadRenderer(path.join(__dirname, '..'));
  // Which rungs are still placeholders is read from the looks themselves (item 1186),
  // so an era card that lands never edits this test. A placeholder plays the voice of
  // the look it is `like`. Once every rung is built, a stand-in placeholder on the top
  // rung keeps the fact pinned, and the real look goes back afterwards.
  // Eras 7 and 9 are borrowed below and handed back at the end, so the tests
  // after this one hear the real looks' voices.
  const real7 = R.eraLook(7);
  const real9 = R.eraLook(9);
  const waiting = [];
  for (let e = 0; e <= Pong.TOP_ERA; e++) if (R.eraLook(e).placeholder) waiting.push(e);
  const top = R.eraLook(Pong.TOP_ERA);
  if (!waiting.length) {
    R.registerEra({ era: Pong.TOP_ERA, name: top.name, card: top.card, like: 5, placeholder: true });
    waiting.push(Pong.TOP_ERA);
  }
  for (const e of waiting) {
    const like = R.eraLook(e).like;
    assert.ok(like !== undefined && like < e, `placeholder rung ${e} names the look it borrows`);
    assert.deepStrictEqual(waves(e, 'paddle'), waves(like, 'paddle'), `placeholder rung ${e} borrows the voice of era ${like}`);
    assert.deepStrictEqual(PongSound.echoFor(e), PongSound.echoFor(like));
  }
  if (R.eraLook(Pong.TOP_ERA) !== top) R.registerEra(top);
  // A rung whose look has no voice at all plays the Super Nintendo's row and echo.
  R.registerEra(Object.assign({}, R.eraLook(9), { era: 9, voice: undefined }));
  assert.deepStrictEqual(waves(9, 'paddle'), waves(4, 'paddle'), 'a voiceless rung borrows the Super Nintendo');
  assert.deepStrictEqual(PongSound.echoFor(9), PongSound.echoFor(4));
  const voice = { paddle: [{ wave: 'sine', freq: 659, dur: 0.1, gain: 0.2 }], effects: { echo: { time: 0.12, feedback: 0.25, mix: 0.2 } } };
  R.registerEra(Object.assign({}, R.eraLook(7), { era: 7, voice }));
  assert.deepStrictEqual(PongSound.voicesFor(7, 'paddle'), voice.paddle);
  assert.deepStrictEqual(PongSound.voicesFor(7, 'wall'), [], 'the look\'s voice is the whole voice');
  assert.deepStrictEqual(PongSound.echoFor(7), voice.effects.echo);
  R.registerEra(real9);
  R.registerEra(real7);
});

// --------------------------------------------------------------- the player
test('nothing is made -- not even an audio context -- before the first click or key', () => {
  const { FakeContext, log } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  const g = newGame();
  placeBall(g, g.width / 2, 2, 200, -300);
  Pong.step(g, 0.05, {});
  assert.strictEqual(player.handle(g), 0);
  assert.strictEqual(log.contexts, 0);
  assert.strictEqual(log.oscillators.length, 0);

  assert.strictEqual(player.unlock(), true);
  assert.strictEqual(log.contexts, 1);
  player.unlock();
  assert.strictEqual(log.contexts, 1, 'a second click opens no second context');
  assert.strictEqual(player.handle(g), 1);
  assert.strictEqual(log.oscillators.length, 1);
  assert.strictEqual(log.oscillators[0].type, 'square');
});

test('with no audio device at all the player is silent and never throws', () => {
  const g = newGame(4);
  placeBall(g, g.width / 2, 2, 200, -300);
  Pong.step(g, 0.05, {});

  const none = PongSound.createPlayer({ AudioContext: null });
  assert.strictEqual(none.unlock(), false);
  assert.strictEqual(none.handle(g), 0);
  assert.strictEqual(none.available, false);

  const broken = PongSound.createPlayer({ AudioContext: function () { throw new Error('no device'); } });
  assert.doesNotThrow(() => broken.unlock());
  assert.strictEqual(broken.handle(g), 0);
  assert.strictEqual(broken.errors, 1);
});

test('each era schedules the oscillators its design names', () => {
  const expected = {
    0: ['square'], 1: ['square'], 2: ['square', 'triangle'], 3: ['sine'], 4: ['sawtooth', 'sine', 'triangle']
  };
  for (const era of [0, 1, 2, 3, 4]) {
    const { FakeContext, log } = recorder();
    const player = PongSound.createPlayer({ AudioContext: FakeContext });
    player.unlock();
    for (const type of TYPES) assert.ok(player.play({ type, era }), `era ${era} ${type} sounded`);
    const carriers = new Set(log.oscillators.map((o) => o.type));
    // FM modulators are sines too; the set of wave types is what matters.
    assert.deepStrictEqual([...carriers].sort(), expected[era], `era ${era} waves`);
    assert.strictEqual(player.errors, 0);
    assert.strictEqual(log.started, log.oscillators.length, 'every oscillator is started');
  }
});

test('the Genesis modulator really drives the carrier\'s pitch', () => {
  const { FakeContext, log } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  player.play({ type: 'paddle', era: 3 });
  const intoPitch = log.edges.filter((e) => e.to && e.to.name === 'frequency');
  assert.strictEqual(intoPitch.length, 1, 'one FM operator for one voice');
  assert.strictEqual(log.oscillators.length, 2, 'carrier plus modulator');
});

test('only the Super Nintendo builds an echo, and builds it once', () => {
  const { FakeContext, log } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  for (const era of [0, 1, 2, 3]) player.play({ type: 'score', era });
  assert.strictEqual(log.delays.length, 0);
  player.play({ type: 'paddle', era: 4 });
  player.play({ type: 'score', era: 4 });
  assert.strictEqual(log.delays.length, 1);
  const loop = log.edges.some((e) => e.from.kind === 'gain' && e.to === log.delays[0]) &&
               log.edges.some((e) => e.from === log.delays[0] && e.to.kind === 'gain');
  assert.ok(loop, 'the delay feeds back through a gain');
});

// ------------------------------------------------------------- the boot sting
test('the boot sting: the point that moves the machine up plays the arriving era\'s boot list instead of its score', () => {
  const { FakeContext, log } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  const g = newGame(0);
  placeBall(g, g.width - 2, g.height / 2, 400, 0);
  g.right.y = 20;
  Pong.step(g, 0.05, {});
  assert.strictEqual(g.era, 1);
  assert.strictEqual(player.handle(g), 1);
  assert.deepStrictEqual([player.last.type, player.last.era], ['boot', 1]);
  assert.strictEqual(player.boots, 1);
  const boot = PongSound.voicesFor(1, 'boot');
  assert.ok(boot.length > PongSound.voicesFor(1, 'score').length, 'the Atari voice carries a boot list');
  assert.strictEqual(log.oscillators.length, boot.reduce((n, v) => n + (v.fm ? 2 : 1), 0), 'every note of it scheduled');
  assert.strictEqual(player.errors, 0);
});

test('a point that leaves the machine where it is plays its plain score', () => {
  const { FakeContext } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  // The rules stamp eraChangedAt with the moment of the point that moved the machine.
  player.handle({ era: 1, eraChangedAt: 3, events: [{ type: 'score', era: 1, time: 5 }] });
  assert.deepStrictEqual([player.last.type, player.boots], ['score', 0], 'an older change is not this point\'s');
  player.handle({ era: 1, eraChangedAt: 5, events: [{ type: 'score', era: 1, time: 5 }] });
  assert.deepStrictEqual([player.last.type, player.boots], ['boot', 1]);
});

test('a new match boots again even when the last thing heard was higher up the ladder', () => {
  const { FakeContext } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  player.play({ type: 'paddle', era: 4 });
  const g = newGame(0);
  placeBall(g, g.width - 2, g.height / 2, 400, 0);
  g.right.y = 20;
  Pong.step(g, 0.05, {});
  player.handle(g);
  assert.deepStrictEqual([player.last.type, player.last.era], ['boot', 1]);
});

test('a bare event, with no game to ask, boots only above the last era the player sounded', () => {
  const { FakeContext } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  player.play({ type: 'score', era: 1 });
  assert.strictEqual(player.last.type, 'score', 'nothing sounded yet: no rise to judge');
  player.play({ type: 'paddle', era: 0 });
  player.play({ type: 'score', era: 1 });
  assert.strictEqual(player.last.type, 'boot');
  player.play({ type: 'score', era: 1 });
  assert.strictEqual(player.last.type, 'score', 'the same era again is not a rise');
  assert.strictEqual(player.boots, 1);
});

test('the player reads the game and never changes it', () => {
  const { FakeContext } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  const g = newGame(3);
  const snap = (s) => JSON.stringify(s, (k, v) => (typeof v === 'function' ? undefined : v));
  let heard = 0;
  for (let i = 0; i < 2000; i++) {
    Pong.step(g, 1 / 60, { pointerY: g.ball.y + g.ball.size / 2 });
    const before = snap(g);
    heard += player.handle(g);
    assert.strictEqual(snap(g), before);
  }
  assert.ok(heard > 5, `a long rally makes plenty of sound (${heard} events)`);
});

test('a flood of events in one frame is capped, not a pile of notes', () => {
  const { FakeContext } = recorder();
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  const flood = { events: Array.from({ length: 30 }, () => ({ type: 'wall', era: 0 })) };
  assert.strictEqual(player.handle(flood), 4);
});

// --------------------------------------------- the 3D eras' grammar (item 1181)
// Driven through tools/soundtrace.js's recorder, which has the whole Web Audio
// surface the player may reach for and logs every call it is asked for.
const Trace = require('../tools/soundtrace.js');

function traced() {
  const { TraceContext, log } = Trace.traceContext();
  const player = PongSound.createPlayer({ AudioContext: TraceContext });
  player.unlock();
  for (const n of log.all) if (n.kind === 'gain') n.__label = 'master';   // the one gain unlock makes
  const nameOf = (n) => n.__label || 'n' + n.__id;
  const t = {
    player, log,
    nodes: (kind) => log.all.filter((n) => n.kind === kind),
    calls: (n, pname) => log.ops.filter((o) => o[0] === 'param' && o[1] === nameOf(n) && o[2] === pname),
    into: (n) => log.ops.filter((o) => o[0] === 'connect' && o[2] === nameOf(n)).map((o) => o[1]),
    outOf: (n) => log.ops.filter((o) => o[0] === 'connect' && o[1] === nameOf(n)).map((o) => o[2]),
    buffers: () => log.ops.filter((o) => o[0] === 'buffer'),
    name: nameOf
  };
  return t;
}

const path = require('node:path');
const { R: Looks } = require('../tools/eralooks.js').loadRenderer(path.join(__dirname, '..'));

/** Play `notes` as a paddle hit on a borrowed rung, then hand the rung back. */
function withVoice(era, voice, fn) {
  const real = Looks.eraLook(era);
  Looks.registerEra(Object.assign({}, real, { era, voice }));
  try { return fn(); } finally { Looks.registerEra(real); }
}

test('eras 0 to 4 schedule exactly the calls they made before the 3D grammar was built', () => {
  const before = JSON.parse(require('node:fs').readFileSync(Trace.FIXTURE, 'utf8'));
  const now = Trace.traceEras(PongSound);
  assert.deepStrictEqual(Object.keys(now), Object.keys(before));
  for (const k of Object.keys(before)) assert.deepStrictEqual(now[k], before[k], `${k} sounds as it did`);
});

test('noise: one shared 2-second buffer made at unlock, looped by every noise note through its filter', () => {
  const t = traced();
  const made = t.buffers();
  assert.deepStrictEqual(made, [['buffer', 1, 96000, 48000]], 'one mono buffer, 2 seconds at the context\'s rate');
  const voice = { paddle: [
    { wave: 'noise', dur: 0.015, gain: 0.12, filter: { type: 'highpass', freq: 3000 } },
    { wave: 'noise', at: 0.1, dur: 0.02, gain: 0.1 }
  ] };
  withVoice(10, voice, () => { assert.ok(t.player.play({ type: 'paddle', era: 10 })); });
  const srcs = t.nodes('buffersource');
  assert.strictEqual(srcs.length, 2);
  assert.strictEqual(t.nodes('oscillator').length, 0, 'a noise note is no oscillator');
  assert.strictEqual(srcs[0].buffer, srcs[1].buffer, 'both loop the same buffer');
  assert.ok(srcs.every((s) => s.loop === true));
  assert.deepStrictEqual(t.buffers().length, 1, 'playing makes no second noise buffer');
  const starts = t.log.ops.filter((o) => o[0] === 'start');
  assert.deepStrictEqual(starts.map((o) => o[2]), [0.005, 0.105]);
  assert.notStrictEqual(starts[0][3], starts[1][3], 'two clicks start at different places in the loop');
  const hp = t.nodes('biquad')[0];
  assert.strictEqual(hp.type, 'highpass');
  assert.deepStrictEqual(t.into(hp), [t.name(srcs[0])], 'the first click runs through its highpass');
  assert.deepStrictEqual(t.calls(hp, 'frequency').map((o) => o.slice(3)), [['setValueAtTime', 3000, 0.005]]);
  const data = srcs[0].buffer.getChannelData(0);
  let lo = 0, hi = 0, sum = 0;
  for (const x of data) { lo = Math.min(lo, x); hi = Math.max(hi, x); sum += x; }
  assert.ok(lo >= -1 && hi <= 1 && hi - lo > 1.9, 'white noise fills -1..1');
  assert.ok(Math.abs(sum / data.length) < 0.01, 'centred on zero');
  assert.strictEqual(t.player.errors, 0);
  assert.strictEqual(t.player.skipped, 0);
});

test('attack: seconds to peak, 0.004 when left out, never past the note\'s end', () => {
  const t = traced();
  const voice = { paddle: [
    { wave: 'sine', freq: 440, dur: 1.2, gain: 0.06, attack: 0.4 },
    { wave: 'sine', freq: 440, dur: 0.1, gain: 0.2 },
    { wave: 'sine', freq: 440, dur: 0.1, gain: 0.2, attack: 5 }
  ] };
  withVoice(10, voice, () => t.player.play({ type: 'paddle', era: 10 }));
  const envs = t.nodes('gain').filter((g) => t.calls(g, 'gain').some((o) => o[3] === 'linearRampToValueAtTime'));
  const ramp = (g) => t.calls(g, 'gain').find((o) => o[3] === 'linearRampToValueAtTime').slice(4);
  assert.deepStrictEqual(ramp(envs[0]), [0.06, 0.405]);
  assert.deepStrictEqual(ramp(envs[1]), [0.2, 0.009]);
  assert.ok(ramp(envs[2])[1] < 0.005 + 0.1, 'an attack longer than the note peaks inside it');
});

test('filter: type, cutoff, q (0.7 when left out) and the exponential glide to `to` over the note', () => {
  const t = traced();
  const voice = { paddle: [
    { wave: 'sawtooth', freq: 110, dur: 0.14, gain: 0.3, filter: { type: 'lowpass', freq: 2200, q: 8, to: 300 } },
    { wave: 'square', freq: 880, dur: 0.05, gain: 0.1, filter: { type: 'bandpass', freq: 3000 } }
  ] };
  withVoice(10, voice, () => t.player.play({ type: 'paddle', era: 10 }));
  const [slap, band] = t.nodes('biquad');
  assert.deepStrictEqual([slap.type, band.type], ['lowpass', 'bandpass']);
  assert.deepStrictEqual(t.calls(slap, 'frequency').map((o) => o.slice(3)),
    [['setValueAtTime', 2200, 0.005], ['exponentialRampToValueAtTime', 300, 0.145]]);
  assert.deepStrictEqual(t.calls(slap, 'Q').map((o) => o[4]), [8]);
  assert.deepStrictEqual(t.calls(band, 'Q').map((o) => o[4]), [0.7]);
  assert.strictEqual(t.calls(band, 'frequency').length, 1, 'no glide without `to`');
  const osc = t.nodes('oscillator')[0];
  assert.deepStrictEqual(t.outOf(osc), [t.name(slap)], 'the oscillator feeds its filter');
  assert.strictEqual(t.outOf(slap).length, 1);
  assert.ok(t.outOf(slap)[0] !== 'master', 'and the filter feeds the envelope, not the speakers');
});

test('unison: that many copies detuned evenly from -spread to +spread cents, each at gain / voices', () => {
  const t = traced();
  const voice = { paddle: [
    { wave: 'sawtooth', freq: 262, slideTo: 131, dur: 1.4, gain: 0.07, unison: { voices: 3, spread: 12 } }
  ] };
  withVoice(10, voice, () => t.player.play({ type: 'paddle', era: 10 }));
  const oscs = t.nodes('oscillator');
  assert.strictEqual(oscs.length, 3);
  assert.deepStrictEqual(PongSound.unisonCents({ voices: 3, spread: 12 }), [-12, 0, 12]);
  assert.deepStrictEqual(PongSound.unisonCents({ voices: 5, spread: 20 }), [-20, -10, 0, 10, 20]);
  const r = (c) => Math.pow(2, c / 1200);
  oscs.forEach((o, i) => {
    const [set, slide] = t.calls(o, 'frequency');
    assert.ok(Math.abs(set[4] - 262 * r([-12, 0, 12][i])) < 1e-4, `copy ${i} starts detuned`);
    assert.ok(Math.abs(slide[4] - 131 * r([-12, 0, 12][i])) < 1e-4, `copy ${i} slides detuned`);
  });
  const env = t.nodes('gain').find((g) => t.calls(g, 'gain').some((o) => o[3] === 'linearRampToValueAtTime'));
  assert.strictEqual(t.calls(env, 'gain').find((o) => o[3] === 'linearRampToValueAtTime')[4], Math.round(0.07 / 3 * 1e6) / 1e6);
  assert.ok(oscs.every((o) => t.outOf(o)[0] === t.name(env)), 'all three copies sum into one envelope');
  assert.strictEqual(t.log.ops.filter((o) => o[0] === 'start').length, 3);
});

test('lfo: a tremolo swinging the note\'s gain between 1 - depth and 1', () => {
  const t = traced();
  const voice = { paddle: [{ wave: 'sine', freq: 45, dur: 2.4, gain: 0.5, lfo: { freq: 6, depth: 0.6 } }] };
  withVoice(10, voice, () => t.player.play({ type: 'paddle', era: 10 }));
  const [carrier, lfo] = t.nodes('oscillator');
  assert.strictEqual(lfo.type, 'sine');
  assert.deepStrictEqual(t.calls(lfo, 'frequency').map((o) => o[4]), [6]);
  const swing = t.nodes('gain').find((g) => t.into(g).includes(t.name(lfo)));
  assert.deepStrictEqual(t.calls(swing, 'gain').map((o) => o[4]), [0.3]);
  const trem = t.nodes('gain').find((g) => t.outOf(swing).includes(t.name(g) + '.gain'));
  assert.deepStrictEqual(t.calls(trem, 'gain').map((o) => o[4]), [0.7], 'rests at 1 - depth / 2');
  assert.deepStrictEqual(t.outOf(trem), ['master']);
  assert.ok(t.log.ops.some((o) => o[0] === 'start' && o[1] === t.name(lfo)), 'the lfo runs');
  assert.ok(t.log.ops.some((o) => o[0] === 'stop' && o[1] === t.name(lfo)), 'and stops with the note');
  assert.ok(carrier);
});

test('shape: a WaveShaper on tanh(k x), k = 1 + 20 * shape, 1024 points built once', () => {
  const curve = PongSound.shapeCurve(0.3);
  assert.strictEqual(curve.length, 1024);
  assert.ok(Math.abs(curve[1023] - Math.tanh(7)) < 1e-6 && Math.abs(curve[0] + Math.tanh(7)) < 1e-6);
  assert.strictEqual(PongSound.shapeCurve(0.3), curve, 'the same curve every time');
  const t = traced();
  const voice = { paddle: [
    { wave: 'square', freq: 220, dur: 0.2, gain: 0.2, shape: 0.3, filter: { type: 'lowpass', freq: 900 } },
    { wave: 'square', freq: 330, dur: 0.2, gain: 0.2, shape: 0.3 }
  ] };
  withVoice(10, voice, () => t.player.play({ type: 'paddle', era: 10 }));
  const shapers = t.nodes('shaper');
  assert.strictEqual(shapers.length, 2);
  assert.strictEqual(shapers[0].curve, curve);
  assert.strictEqual(shapers[1].curve, curve);
  assert.deepStrictEqual(t.outOf(shapers[0]), [t.name(t.nodes('biquad')[0])], 'drive, then the filter');
});

test('reverb: a ConvolverNode on a decaying noise impulse, built once per era on first use', () => {
  const t = traced();
  const spec = PongSound.effectsFor(5).reverb;
  assert.deepStrictEqual(spec, { seconds: 1.2, decay: 2.5, mix: 0.25 }, 'the PlayStation\'s room');
  t.player.play({ type: 'paddle', era: 5 });
  t.player.play({ type: 'wall', era: 5 });
  t.player.play({ type: 'score', era: 5 });
  const convs = t.nodes('convolver');
  assert.strictEqual(convs.length, 1, 'one room for the era, however many notes');
  const imp = convs[0].buffer;
  assert.deepStrictEqual([imp.numberOfChannels, imp.length], [2, 1.2 * 48000]);
  const energy = (d, a, b) => { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return e; };
  const d0 = imp.getChannelData(0);
  assert.ok(energy(d0, 0, 1000) > 50 * energy(d0, d0.length - 10000, d0.length - 9000), 'the tail dies away');
  assert.notDeepStrictEqual(Array.from(d0.slice(0, 64)), Array.from(imp.getChannelData(1).slice(0, 64)), 'two different ears');
  const wet = t.nodes('gain').find((g) => t.into(g).includes(t.name(convs[0])));
  assert.deepStrictEqual(t.calls(wet, 'gain').map((o) => o[4]), [0.25]);
  assert.deepStrictEqual(t.outOf(wet), ['master']);
  assert.ok(t.into(convs[0]).length >= 5, 'every note of the era is sent into the room');
  t.player.play({ type: 'paddle', era: 8 });
  const rooms = t.nodes('convolver');
  assert.strictEqual(rooms.length, 2, 'the PlayStation 2 builds its own');
  assert.strictEqual(rooms[1].buffer.length, PongSound.effectsFor(8).reverb.seconds * 48000);
  assert.strictEqual(t.player.last.reverb, true);
  assert.deepStrictEqual([t.player.errors, t.player.skipped], [0, 0]);
});

test('bus: every note of the era passes through one filter, and its reverb tail with it', () => {
  const t = traced();
  const fx = PongSound.effectsFor(6);
  assert.deepStrictEqual(fx.bus, { type: 'lowpass', freq: 3200, q: 0.7 }, 'the Nintendo 64\'s muffling');
  t.player.play({ type: 'paddle', era: 6 });
  t.player.play({ type: 'score', era: 6 });
  const bus = t.nodes('biquad').find((f) => t.calls(f, 'frequency').some((o) => o[3] === 'value'));
  assert.ok(bus, 'a bus filter');
  assert.strictEqual(bus.type, 'lowpass');
  assert.deepStrictEqual(t.calls(bus, 'frequency').map((o) => o[4]), [3200]);
  assert.deepStrictEqual(t.calls(bus, 'Q').map((o) => o[4]), [0.7]);
  assert.strictEqual(t.nodes('biquad').filter((f) => t.calls(f, 'frequency').some((o) => o[3] === 'value')).length, 1, 'built once');
  const conv = t.nodes('convolver')[0];
  assert.deepStrictEqual(t.outOf(bus).sort(), ['master', t.name(conv)].sort(), 'the bus feeds the speakers and the room');
  const intoMaster = t.log.ops.filter((o) => o[0] === 'connect' && o[2] === 'master').map((o) => o[1]);
  const wet = t.nodes('gain').find((g) => t.into(g).includes(t.name(conv)));
  assert.deepStrictEqual(intoMaster.sort(), [t.name(bus), t.name(wet)].sort(), 'no note reaches the speakers around the bus');
  assert.ok(t.into(bus).length >= 2, 'the notes go into the bus');
  assert.strictEqual(t.player.last.bus, true);
});

test('an era\'s shape effect is a WaveShaper at the head of its bus', () => {
  const t = traced();
  assert.strictEqual(PongSound.effectsFor(9).shape, 0.3, 'the Xbox\'s drive');
  t.player.play({ type: 'paddle', era: 9 });
  const shapers = t.nodes('shaper');
  assert.strictEqual(shapers.length, 1);
  assert.strictEqual(shapers[0].curve, PongSound.shapeCurve(0.3));
  const conv = t.nodes('convolver')[0];
  assert.deepStrictEqual(t.outOf(shapers[0]).sort(), ['master', t.name(conv)].sort());
  assert.ok(t.into(shapers[0]).length >= 3, 'every note of the hit is driven');
});

test('echo is keyed by era: the Dreamcast gets its own, not the Super Nintendo\'s', () => {
  const t = traced();
  t.player.play({ type: 'paddle', era: 4 });
  t.player.play({ type: 'paddle', era: 7 });
  t.player.play({ type: 'wall', era: 4 });
  t.player.play({ type: 'wall', era: 7 });
  const delays = t.nodes('delay');
  assert.strictEqual(delays.length, 2, 'one echo each, built once each');
  assert.deepStrictEqual(delays.map((d) => t.calls(d, 'delayTime')[0][4]), [0.14, 0.12]);
  assert.deepStrictEqual(PongSound.effectsFor(7).echo, { time: 0.12, feedback: 0.25, mix: 0.2 });
});

test('every 3D era plays every sound it has with nothing skipped and nothing thrown', () => {
  for (let era = 5; era <= Pong.TOP_ERA; era++) {
    const t = traced();
    for (const type of ['paddle', 'wall', 'score']) assert.ok(t.player.play({ type, era }), `era ${era} ${type}`);
    t.player.handle({ era, eraChangedAt: 9, events: [{ type: 'score', era, time: 9 }] });
    assert.deepStrictEqual([t.player.errors, t.player.skipped], [0, 0], `era ${era}`);
    const noiseNotes = ['paddle', 'wall', 'score', 'boot']
      .reduce((n, type) => n + PongSound.voicesFor(era, type).filter((v) => v.wave === 'noise').length, 0);
    assert.strictEqual(t.nodes('buffersource').length, noiseNotes, `era ${era}: every noise note is heard`);
  }
});

test('an audio context without the 3D nodes still plays what it can, counting the rest as skipped', () => {
  const { FakeContext, log } = recorder();   // oscillators, gains and delays only
  const player = PongSound.createPlayer({ AudioContext: FakeContext });
  player.unlock();
  for (let era = 5; era <= Pong.TOP_ERA; era++) assert.ok(player.play({ type: 'paddle', era }));
  assert.strictEqual(player.errors, 0);
  assert.ok(player.skipped > 0);
  assert.ok(log.oscillators.length > 0, 'the tonal notes still sound');
});

test('the sound module touches no browser globals when it loads', () => {
  const src = require('node:fs')
    .readFileSync(require('node:path').join(__dirname, '..', 'src', 'sound.js'), 'utf8');
  assert.ok(!/\bdocument\b|\bwindow\b|requestAnimationFrame|setTimeout/.test(
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
});
