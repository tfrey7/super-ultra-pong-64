'use strict';
/*
 * Era 6 -- 1996 Nintendo 64 (docs/ERAS.md chapter 7, card 1146). Headless: the
 * era draws onto logging contexts, and a stand-in document hands it offscreen
 * canvases so the blurred buffer can be checked too.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');
const cameras = require('../tools/table3d-cameras.js');
const T = require('../src/table3d.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const PongSound = require('../src/sound.js');

const BIBLE_CAMERA = { tilt: 26, height: 900, fov: 39.5, screenY: 301 };
const BIBLE_FOG = { start: 0.25, end: 1.15, power: 1.2, max: 0.92, colour: '#b9d4ec' };
const BIBLE_CARD = { flash: '#ffffff', wipe: ['#b9d4ec', '#3cb93c', '#1f5fd6'], box: '#1f5fd6', border: '#ffc72c',
  inner: null, year: '#ffc72c', name: '#ffffff', label: '#bfe3ff', dots: null };
const BIBLE_VOICE = {
  paddle: [ { wave: 'square', freq: 392, dur: 0.12, gain: 0.18, filter: { type: 'lowpass', freq: 1400, q: 4, to: 500 } },
            { wave: 'sine', freq: 98, slideTo: 70, dur: 0.10, gain: 0.30 } ],
  wall:   [ { wave: 'triangle', freq: 587, slideTo: 880, dur: 0.09, gain: 0.20 } ],
  score:  [ { wave: 'square', freq: 784, dur: 0.08, gain: 0.12, filter: { type: 'lowpass', freq: 2500 } },
            { wave: 'square', freq: 1047, at: 0.08, dur: 0.40, gain: 0.12, filter: { type: 'lowpass', freq: 2500 } },
            { wave: 'sine', freq: 1047, at: 0.08, dur: 0.50, gain: 0.12 } ],
  boot:   [ { wave: 'noise', dur: 0.02, gain: 0.25, filter: { type: 'bandpass', freq: 1800, q: 3 } },
            { wave: 'sawtooth', freq: 523, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
            { wave: 'sawtooth', freq: 659, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
            { wave: 'sawtooth', freq: 784, at: 0.12, attack: 0.01, dur: 0.9, gain: 0.06, unison: { voices: 3, spread: 15 }, filter: { type: 'lowpass', freq: 2800 } },
            { wave: 'sine', freq: 131, at: 0.12, dur: 0.9, gain: 0.25 } ],
  effects: { bus: { type: 'lowpass', freq: 3200, q: 0.7 }, reverb: { seconds: 1.0, decay: 3, mix: 0.2 } }
};

/**
 * A 2D context that logs every method call in order as
 * { ctx, op, args, fill, smooth }, keeps assigned properties, and hands back
 * gradients and patterns that remember what they were made of.
 */
function logCtx(name, log) {
  const props = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1, imageSmoothingEnabled: true };
  const stack = [];
  return new Proxy({}, {
    get(_, k) {
      if (k in props) return props[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        log.push({ ctx: name, op: k, args, fill: props.fillStyle, smooth: props.imageSmoothingEnabled });
        if (k === 'save') stack.push(Object.assign({}, props));
        if (k === 'restore') Object.assign(props, stack.pop() || {});
        if (k === 'createLinearGradient' || k === 'createRadialGradient') {
          return { kind: k, args, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } };
        }
        if (k === 'createPattern') return { kind: 'pattern', of: args[0] };
        return undefined;
      };
    },
    set(_, k, v) { props[k] = v; return true; }
  });
}

function rally() {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 6 });
  g.serveDelay = 0;
  g.ball.x = 530; g.ball.y = 140; g.ball.vx = 380; g.ball.vy = -120;
  g.left.y = 380; g.right.y = 60;
  g.time = 10;
  return g;
}

/** Draw one frame; answer the log and check the state came back untouched. */
function frame(g) {
  const log = [];
  const before = JSON.stringify(g);
  R.draw(logCtx('main', log), g);
  assert.strictEqual(JSON.stringify(g), before, 'drawing wrote nothing into the state');
  return log;
}

/** Forget the rumble memory another test left behind: a clock that ran backwards. */
function prime(g) {
  const t = g.time;
  g.time = -1e9;
  frame(g);
  g.time = t;
  frame(g);
}

function shakeOf(log) {
  const t = log.find((o) => o.op === 'translate');
  return Math.hypot(t.args[0], t.args[1]);
}

// ------------------------------------------------------------ the look
test('era 6 is built, not a placeholder: the bible\'s camera, card and fog, wearing the colours era 1 picked', () => {
  const look = R.eraLook(6);
  assert.strictEqual(look.era, 6);
  assert.strictEqual(look.name, '1996 Nintendo 64');
  assert.ok(!look.placeholder, 'no longer a placeholder');
  assert.notStrictEqual(look.draw, R.eraLook(5).draw, 'its own draw, not the PlayStation\'s');
  assert.deepStrictEqual(look.camera, BIBLE_CAMERA);
  assert.deepStrictEqual(look.card, BIBLE_CARD);
  assert.deepStrictEqual(look.fog, BIBLE_FOG);
  assert.strictEqual(look.paddleInk, R.eraLook(1).paddleInk);
});

test('the camera is the one tools/table3d-cameras.js measures for era 6, and it passes R3', () => {
  const measured = cameras.ERAS.find((e) => e.era === 6);
  for (const k of Object.keys(BIBLE_CAMERA)) assert.strictEqual(measured[k], BIBLE_CAMERA[k], k);
  assert.ok(cameras.readable(cameras.measure(R.eraLook(6).camera)));
});

test('behind the title era 6 keeps the stock dimmed frame', () => {
  const g = rally();
  const got = eralooks.recorder();
  R.draw(got.ctx, g, { ink: '#3a3a3a' });
  const want = eralooks.recorder();
  R.drawBase(want.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(got.calls, want.calls);
});

// ------------------------------------------------------- the frame, headless
test('the ball is the last thing drawn on the table: a smooth sphere, then its white specular dot, and nothing else is white', () => {
  const g = rally();
  prime(g);
  const log = frame(g);
  const fills = log.filter((o) => o.op === 'fill');
  const dot = fills[fills.length - 1];
  const body = fills[fills.length - 2];
  assert.strictEqual(dot.fill, '#ffffff', 'the specular dot is the last fill');
  assert.strictEqual(body.fill.kind, 'createRadialGradient', 'the ball is a radial-gradient sphere, not a gem');
  assert.deepStrictEqual(body.fill.stops.map((s) => s[1]), ['#ffffff', '#ffe9a8', '#f0b020']);
  const [hx, hy, , cx, cy, r] = body.fill.args;
  assert.ok(hx < cx && hy < cy && r > 0, 'the hot spot sits up and to the left');
  const s = T.ballScreen(T.camera(BIBLE_CAMERA), g);
  assert.ok(Math.abs(cx - s.x) < 1e-9 && Math.abs(cy - s.y) < 1e-9, 'the ball stands where the rules put it');
  assert.ok(r > s.r, 'a bigger ball than the stock table ball');
  assert.ok(fills.slice(0, -1).every((o) => o.fill !== '#ffffff'), 'R1: no other fill is pure white');
});

test('paddles are smooth-shaded boxes, the far one first and fogged no more than 0.35', () => {
  const g = rally();
  prime(g);
  const log = frame(g);
  const grads = log.filter((o) => o.op === 'fill' && o.fill && o.fill.kind === 'createLinearGradient');
  const inkR = R.paddleInk(g, 'right'), inkL = R.paddleInk(g, 'left');
  const farInk = T.mix(inkR, BIBLE_FOG.colour, 0.35);       // right paddle, y 60: past the cap
  assert.ok(T.fogAmount(g.right.y + g.right.h, BIBLE_FOG) > 0.35, 'the far paddle is deep enough to hit the cap');
  const nearFace = (ink) => grads.findIndex((o) => o.fill.stops[0][1] === T.shade(ink, 0.2) && o.fill.stops[1][1] === T.shade(ink, -0.3));
  const far = nearFace(farInk);
  const near = nearFace(inkL);                              // left paddle, y 380: no fog there
  assert.ok(far >= 0, 'the far paddle\'s near face is Gouraud-shaded in its ink, fogged to the cap');
  assert.ok(near >= 0, 'the near paddle wears its ink unfogged');
  assert.ok(far < near, 'far paddle first');
});

test('rumble: a hit shakes 3 px or less for 0.12 s, a point 6 px or less for 0.25 s, the HUD never shakes, and no state is touched', () => {
  const g = rally();
  g.ball.vx = 700; g.ball.vy = 0;             // a fast ball: the full hit rumble
  prime(g);
  const dt = 1 / 120;
  g.time += dt;
  assert.strictEqual(shakeOf(frame(g)), 0, 'nothing happened, nothing shakes');

  const run = (seconds) => {
    let most = 0;
    for (let t = 0; t < seconds; t += dt) { g.time += dt; most = Math.max(most, shakeOf(frame(g))); }
    return most;
  };

  g.rally += 1;                               // a paddle hit
  g.time += dt;
  let most = shakeOf(frame(g));
  most = Math.max(most, run(0.1));
  assert.ok(most > 1 && most <= 3 + 1e-9, `a fast hit shakes, at most 3 px (${most})`);
  run(0.03);                                  // past 0.12 s since the hit
  assert.strictEqual(run(0.05), 0, 'and has settled by 0.12 s');

  g.ball.vx = 400;                            // a slow ball's hit rumbles gentler
  g.rally += 1;
  g.time += dt;
  most = Math.max(shakeOf(frame(g)), run(0.1));
  assert.ok(most > 0.5 && most <= 2 + 1e-9, `a slow hit shakes at most 2 px (${most})`);
  run(0.05);

  g.score.right += 1; g.rally = 0; g.serveDelay = 1;   // a point
  g.time += dt;
  const log = frame(g);
  most = Math.max(shakeOf(log), run(0.22));
  assert.ok(most > 3 && most <= 6 + 1e-9, `a point shakes harder, at most 6 px (${most})`);
  run(0.04);                                  // past 0.25 s since the point
  assert.strictEqual(run(0.1), 0, 'and has settled by 0.25 s');

  // The HUD is drawn after the shaken frame has been restored.
  let depth = 0, shakenUntil = -1, translated = false;
  log.forEach((o, i) => {
    if (o.op === 'save') depth += 1;
    if (o.op === 'translate' && !translated) translated = depth;
    if (o.op === 'restore') { depth -= 1; if (translated !== false && shakenUntil < 0 && depth < translated) shakenUntil = i; }
  });
  const hud = log.map((o, i) => [o, i]).filter(([o]) => o.op === 'fillRect' && (o.fill === '#1f3fbf' || o.fill === '#ffd23c'));
  assert.ok(hud.length > 0, 'the score is drawn');
  assert.ok(hud.every(([, i]) => i > shakenUntil), 'the whole HUD is outside the shake');
});

test('drawing never changes play: a rally stepped with era 6 drawing every frame matches one stepped blind', () => {
  const a = rally(), b = rally();
  prime(a);
  for (let i = 0; i < 600; i++) {
    const intent = { targetY: 300 + 200 * Math.sin(i / 20) };
    Pong.step(a, 1 / 60, intent);
    Pong.step(b, 1 / 60, intent);
    frame(a);
  }
  assert.ok(a.rally > 0 || a.score.left + a.score.right > 0, 'the rally really played');
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

// ------------------------------------------------------ the blurred buffer
test('the world is drawn at half resolution into its own buffer and copied up smoothed; paddles and ball stay crisp on the canvas', () => {
  const log = [];
  const canvases = [];
  let tileRects = 0;
  globalThis.document = {
    createElement() {
      const c = { width: 0, height: 0, id: canvases.length };
      const ctx = logCtx('buf' + c.id, log);
      c.getContext = () => ctx;
      canvases.push(c);
      return c;
    }
  };
  try {
    const g = rally();
    prime(g);                                 // builds the grass tile on its first frame
    tileRects = log.filter((o) => o.op === 'fillRect' && canvases.some((c) => c.width === 16 && o.ctx === 'buf' + c.id)).length;
    log.length = 0;
    R.draw(logCtx('main', log), g);
  } finally {
    delete globalThis.document;
  }
  const buf = canvases.find((c) => c.width === 400 && c.height === 300);
  const tile = canvases.find((c) => c.width === 16 && c.height === 16);
  assert.ok(tileRects >= 16, `the tile is built from rectangles (${tileRects})`);
  assert.ok(!log.some((o) => o.ctx === 'buf' + tile.id), 'and built once: a later frame never redraws it');
  assert.ok(buf && tile, 'a 400 x 300 buffer and a 16 x 16 grass tile');
  const bufName = 'buf' + buf.id;
  const inBuf = log.filter((o) => o.ctx === bufName);
  const main = log.filter((o) => o.ctx === 'main');

  assert.deepStrictEqual(inBuf.find((o) => o.op === 'setTransform').args, [0.5, 0, 0, 0.5, 0, 0], 'drawn at half scale');
  const textured = inBuf.filter((o) => o.op === 'fillRect' && o.fill && o.fill.kind === 'pattern');
  assert.strictEqual(textured.length, 96, '8 x 6 quads, two triangles each, textured');
  assert.ok(textured.every((o) => o.fill.of === tile), 'from the tiny grass tile');
  assert.strictEqual(inBuf.filter((o) => o.op === 'clip').length, 96);
  assert.ok(!inBuf.some((o) => o.op === 'createRadialGradient'), 'the ball never enters the buffer (R2)');

  const copies = main.filter((o) => o.op === 'drawImage');
  assert.strictEqual(copies.length, 1, 'one full-frame pass (R10)');
  assert.strictEqual(copies[0].args[0], buf);
  assert.deepStrictEqual(copies[0].args.slice(1), [0, 0, 800, 600]);
  assert.strictEqual(copies[0].smooth, true, 'copied up with smoothing on: the blur');
  const copyAt = log.indexOf(copies[0]);
  const paddleAndBall = log.filter((o, i) => o.ctx === 'main' && o.op === 'fill' && i > copyAt);
  assert.ok(paddleAndBall.length >= 6, 'paddles and ball are painted on the canvas after the copy (R4)');
  assert.ok(!main.slice(0, main.indexOf(copies[0])).some((o) => o.op === 'fill'), 'nothing is painted on the canvas under the copy but the edge fill');
});

// ------------------------------------------------------------- the voice
test('the voice is the bible\'s Nintendo 64 voice, reached through the look hook: muffled notes and a bassy thud on hits', () => {
  const v = R.eraLook(6).voice;
  assert.deepStrictEqual(v, BIBLE_VOICE);
  for (const type of ['paddle', 'wall', 'score']) {
    assert.deepStrictEqual(PongSound.voicesFor(6, type), BIBLE_VOICE[type], type);
  }
  assert.strictEqual(PongSound.echoFor(6), null, 'no Super Nintendo echo');
  assert.ok(v.paddle.some((n) => n.wave === 'sine' && n.freq < 100 && n.slideTo < n.freq), 'a low thud falling under every hit');
  assert.deepStrictEqual(v.effects.bus, { type: 'lowpass', freq: 3200, q: 0.7 }, 'everything through the muffling lowpass');
});
