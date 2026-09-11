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
  assert.deepStrictEqual(waves(6, 'paddle'), waves(4, 'paddle'), 'a placeholder rung borrows the Super Nintendo');
  assert.deepStrictEqual(PongSound.echoFor(6), PongSound.echoFor(4));
  const voice = { paddle: [{ wave: 'sine', freq: 659, dur: 0.1, gain: 0.2 }], effects: { echo: { time: 0.12, feedback: 0.25, mix: 0.2 } } };
  R.registerEra(Object.assign({}, R.eraLook(7), { era: 7, voice }));
  assert.deepStrictEqual(PongSound.voicesFor(7, 'paddle'), voice.paddle);
  assert.deepStrictEqual(PongSound.voicesFor(7, 'wall'), [], 'the look\'s voice is the whole voice');
  assert.deepStrictEqual(PongSound.echoFor(7), voice.effects.echo);
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

test('the sound module touches no browser globals when it loads', () => {
  const src = require('node:fs')
    .readFileSync(require('node:path').join(__dirname, '..', 'src', 'sound.js'), 'utf8');
  assert.ok(!/\bdocument\b|\bwindow\b|requestAnimationFrame|setTimeout/.test(
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
});
