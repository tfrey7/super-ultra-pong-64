'use strict';
/*
 * Era 9's arrival flourish (src/eras/era9-xbox.js, greenSphere): the change
 * into the Xbox plays as a green orb swelling at the miss, the ring's edge a
 * glowing green energy sphere with a hard metal rim and tendrils of light, and
 * a green pulse as it settles. Behind it the table answers: the light sits in
 * the orb and snaps out to its orbit in the last beat, and the gamertags fade
 * in. The boot thrum is the Xbox voice's `boot` list, played by the player and
 * never by the flourish. Headless: recording contexts; the browser half is the
 * playtest frame.
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
const look = R.eraLook(9);
const X = look.xbox;
const E = R.ERA_CHANGE;

function ps2Game() {
  return Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 8 });
}

function concede(g, y) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y === undefined ? g.height / 2 : y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = g.ball.y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
}

/** A context that logs every call (with the line width and composite in force) and every gradient made. */
function spy() {
  const log = [];
  const o = { lineWidth: 1, globalCompositeOperation: 'source-over', fillStyle: '#000000', shadowBlur: 0 };
  const stack = [];
  const ctx = new Proxy(o, {
    get(t, k) {
      if (k in t) return t[k];
      // save/restore put the state back, as a real canvas does.
      if (k === 'save') return () => { stack.push(Object.assign({}, t)); log.push(['save']); };
      if (k === 'restore') return () => { if (stack.length) Object.assign(t, stack.pop()); log.push(['restore']); };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') {
        return (...a) => { log.push([k, ...a]); return { addColorStop() {} }; };
      }
      return (...a) => { log.push([k, ...a, { lineWidth: t.lineWidth, fill: t.fillStyle, blur: t.shadowBlur }]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return { ctx, log };
}

/** The flourish drawn on its own at t seconds after a miss at origin, as the engine would call it. */
function sphereAt(t, origin) {
  const raw = E.wipeProgress(t, E.wipe);
  const p = E.easeWipe(raw);
  const radius = E.ringRadius(p, origin, 800, 600);
  const s = spy();
  look.flourish(s.ctx, p, origin, 8, 9, { radius, t, duration: E.wipe, width: 800, height: 600, state: null, dim: null });
  return { p, radius, log: s.log };
}

function frame(g, opts) {
  const rec = eralooks.recorder();
  R.drawEraFrame(rec.ctx, g, opts);
  return rec.calls;
}

test('era 9 registers the green sphere on its own look', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  assert.notStrictEqual(look.flourish, R.eraLook(8).flourish);
  assert.notStrictEqual(look.flourish, R.eraLook(10).flourish, 'the Xbox 360 does not replay it');
  assert.ok(E.wipe < Pong.RULES.eraChangePause, 'the ring, and so the flourish, ends inside the serve pause');
});

test('the hook draws only this era\'s arrival, and nothing behind the title', () => {
  const origin = { x: -8, y: 150 };
  const s = spy();
  look.flourish(s.ctx, 0.5, origin, 9, 10, { radius: 400, t: 0.7, width: 800, height: 600 });
  look.flourish(s.ctx, 0.5, origin, 8, 9, { radius: 400, t: 0.7, width: 800, height: 600, dim: '#3a3a3a' });
  assert.deepStrictEqual(s.log, []);
});

test('the three beats: the orb swells first, tendrils ride the edge, a green pulse settles it', () => {
  const origin = { x: -8, y: 150 };
  const early = sphereAt(0.3, origin);
  assert.ok(early.p < 0.25);
  const orb = early.log.find((c) => c[0] === 'createRadialGradient' && c[6] <= 90 && c[6] > 20);
  assert.ok(orb && orb[1] === origin.x && orb[2] === origin.y, 'a green orb at the miss');
  assert.ok(!early.log.some((c) => c[0] === 'lineTo'), 'no tendrils yet');

  const mid = sphereAt(0.75, origin);
  assert.ok(mid.p > 0.3 && mid.p < 0.72, `p ${mid.p}`);
  const tendrils = mid.log.filter((c) => c[0] === 'stroke' && c[c.length - 1].blur === 12);
  assert.strictEqual(tendrils.length, 30, 'ten tendrils, each tapering in three widths');
  assert.deepStrictEqual([...new Set(tendrils.map((c) => c[c.length - 1].lineWidth))].sort((a, b) => b - a), [6, 3, 1]);
  assert.ok(mid.log.some((c) => c[0] === 'stroke' && c[c.length - 1].lineWidth === 8), 'the hard metal rim');
  assert.ok(!mid.log.some((c) => c[0] === 'fillRect'), 'no pulse before the last beat');

  const late = sphereAt(1.2, origin);
  assert.ok(late.p > 0.8);
  const pulse = late.log.filter((c) => c[0] === 'fillRect');
  assert.strictEqual(pulse.length, 1);
  assert.deepStrictEqual(pulse[0].slice(1, 5), [0, 0, 800, 600]);
  const alpha = Number(/,([\d.]+)\)$/.exec(pulse[0][5].fill)[1]);
  assert.ok(alpha <= 0.12 && alpha <= 0.35, `a full-frame pulse at ${alpha}, under the 0.35 a wash may reach`);
});

test('nothing it draws reaches more than 60 past the ring, on any frame, from any miss', () => {
  for (const origin of [{ x: -8, y: 150 }, { x: 808, y: 560 }, { x: 0, y: 300 }]) {
    for (let t = 0.004; t < E.wipe; t += 0.02) {
      const { radius, log } = sphereAt(t, origin);
      const limit = radius + 60;
      for (const c of log) {
        if (c[0] === 'arc') {
          const w = c[c.length - 1].lineWidth / 2;
          assert.ok(Math.hypot(c[1] - origin.x, c[2] - origin.y) + c[3] + w <= limit + 1e-9, `arc ${c[3]} at t ${t}, ring ${radius}`);
        }
        if (c[0] === 'createRadialGradient') assert.ok(c[6] <= limit, `a glow of ${c[6]} at t ${t}, ring ${radius}`);
        if (c[0] === 'moveTo' || c[0] === 'lineTo') {
          assert.ok(Math.hypot(c[1] - origin.x, c[2] - origin.y) <= limit, `a tendril point at t ${t}`);
        }
      }
    }
  }
});

test('the orb swells to 90 over the ignition, keyed to the clock, not the ring', () => {
  assert.ok(Math.abs(X.orbRadius(0.38, 1000) - 90) <= 4, 'full size by the end of the ignition, throbbing with the thrum');
  assert.ok(X.orbRadius(0.05, 0.2) > 0, 'already showing while the ring is under a unit wide');
  assert.ok(X.orbRadius(0.2, 5) <= 5 + 56, 'but never more than 56 past the ring');
});

test('behind the sphere the light sits in the orb, then snaps out to its orbit', () => {
  const origin = { x: -8, y: 150 };
  const at = (p) => X.arrivalLight(50, { p, origin });
  assert.deepStrictEqual([at(0.5).x, at(0.5).y], [origin.x, origin.y]);
  const orbit = X.lightAt(50);
  assert.ok(Math.abs(at(1).x - orbit.x) < 1e-9 && Math.abs(at(1).y - orbit.y) < 1e-9);
  const half = (at(0.9).x - origin.x) / (orbit.x - origin.x);
  assert.ok(half > 0.8 && half < 1, `a snap: ${half.toFixed(3)} of the way at half the beat`);
  assert.deepStrictEqual(X.arrivalLight(50, null), orbit, 'in play the light orbits as before');
});

test('a real change into era 9: the flourish plays, the tags fade in, the state is untouched and the paddle follows the hand', () => {
  const g = ps2Game();
  concede(g, 200);
  assert.strictEqual(g.era, 9);
  const tagCells = () => { const rec = eralooks.recorder(); R.draw(rec.ctx, g); return rec.calls.filter((c) => c[0] === '#d7f5c0').length; };
  let calls = 0;
  const orig = look.flourish;
  look.flourish = function () { calls += 1; return orig.apply(this, arguments); };
  try {
    let sawHidden = false, sawShown = false, frames = 0;
    for (let i = 0; i < 200; i++) {
      const m = R.eraChangeMoment(g);
      if (!m || !m.wiping) break;
      frames += 1;
      const before = JSON.stringify(g);
      frame(g);
      assert.strictEqual(JSON.stringify(g), before, 'drawing the arrival writes nothing');
      assert.ok(m.era === 9 && X.arrivalLight(g.time, m) !== null);
      if (m.p < 0.45) sawHidden = sawHidden || tagCells() === 0;
      if (m.p > 0.8) sawShown = sawShown || tagCells() > 40;
      const hand = i % 20 < 10 ? 120 : 480;
      Pong.step(g, FRAME, { pointerY: hand });
    }
    assert.ok(frames > 60, `${frames} frames of ring`);
    assert.strictEqual(calls, frames, 'the Xbox\'s hook drew every frame of its ring');
    assert.ok(sawHidden, 'no gamertags as the sphere sets off');
    assert.ok(sawShown, 'both gamertags up by the last beat');
    assert.ok(g.serveDelay > 0, 'the ring is over and the serve has not launched');
    assert.ok(Math.abs(g.left.y + g.left.h / 2 - 480) < 90 || Math.abs(g.left.y + g.left.h / 2 - 120) < 90, 'the paddle is where the hand put it');
  } finally {
    look.flourish = orig;
  }
});

/** A silent stand-in for Web Audio: enough surface for the player to schedule every note field. */
function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = (extra) => Object.assign({ connect(to) { return to; }, disconnect() {} }, extra);
  return class {
    constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = node({}); }
    createOscillator() { return node({ type: 'sine', frequency: param(), detune: param(), start() {}, stop() {} }); }
    createGain() { return node({ gain: param() }); }
    createDelay() { return node({ delayTime: param() }); }
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); }
    createWaveShaper() { return node({ curve: null }); }
    createConvolver() { return node({ buffer: null }); }
    createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { return node({ buffer: null, loop: false, start() {}, stop() {} }); }
  };
}

test('the boot thrum is the Xbox voice\'s own sting, sounded once however often the ring is drawn', () => {
  assert.strictEqual(Sound.voicesFor(9, 'boot'), look.voice.boot);
  assert.strictEqual(look.voice.boot[0].lfo.freq, 6, 'the pulsing sub');
  const player = Sound.createPlayer({ AudioContext: fakeAudio() });
  player.unlock();
  const g = ps2Game();
  concede(g);
  player.handle(g);
  assert.strictEqual(player.last && player.last.type, 'boot');
  assert.strictEqual(player.last.era, 9);
  for (let i = 0; i < 100; i++) { frame(g); frame(g); Pong.step(g, FRAME, {}); player.handle(g); }
  assert.strictEqual(player.boots, 1, 'once for the whole ring');
});

test('the era file never reaches for the sound module, the page\'s player or the voice table', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'eras', 'era9-xbox.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/PongSound|__pongSound|VOICES|\.play\s*\(/.test(code));
  assert.ok(!/getImageData|putImageData/.test(code), 'no per-pixel work');
});
